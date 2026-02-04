/**
 * LLM Settings Service
 *
 * Manages LLM provider configurations and API key storage.
 * Features:
 * - Encrypted API key storage using Web Crypto API
 * - User consent flow for persistent storage
 * - Session-only storage option
 */

import {
  LlmSettings,
  LlmProviderType,
  LlmProviderConfig,
  DEFAULT_LLM_SETTINGS,
  DEFAULT_PROVIDER_CONFIGS,
  isProviderConfigured,
} from '../../models/llm';

const STORAGE_KEY = 'sdrf_llm_settings';
const ENCRYPTION_KEY_NAME = 'sdrf_llm_key';

/**
 * Configuration for the settings service.
 */
export interface LlmSettingsServiceConfig {
  /** Use session storage instead of localStorage for testing */
  useSessionStorage?: boolean;
}

/**
 * LLM Settings Service
 *
 * Handles secure storage and retrieval of LLM provider configurations.
 */
export class LlmSettingsService {
  private settings: LlmSettings;
  private cryptoKey: CryptoKey | null = null;
  private useSessionStorage: boolean;

  constructor(config: LlmSettingsServiceConfig = {}) {
    this.useSessionStorage = config.useSessionStorage || false;
    this.settings = this.loadSettings();
  }

  // ============ Public API ============

  /**
   * Gets the current settings.
   */
  getSettings(): LlmSettings {
    return { ...this.settings };
  }

  /**
   * Gets the active provider type.
   */
  getActiveProvider(): LlmProviderType {
    return this.settings.activeProvider;
  }

  /**
   * Sets the active provider.
   */
  setActiveProvider(provider: LlmProviderType): void {
    this.settings.activeProvider = provider;
    this.saveSettings();
  }

  /**
   * Gets configuration for a specific provider.
   */
  getProviderConfig(provider: LlmProviderType): LlmProviderConfig | undefined {
    const saved = this.settings.providers[provider];
    if (!saved) return undefined;

    // Merge with defaults
    return {
      ...DEFAULT_PROVIDER_CONFIGS[provider],
      ...saved,
      provider,
    } as LlmProviderConfig;
  }

  /**
   * Gets configuration for the active provider.
   */
  getActiveProviderConfig(): LlmProviderConfig | undefined {
    return this.getProviderConfig(this.settings.activeProvider);
  }

  /**
   * Checks if any LLM provider is configured with an API key.
   * Ollama doesn't require an API key, so it's always considered configured if selected.
   */
  isAnyProviderConfigured(): boolean {
    const activeProvider = this.settings.activeProvider;

    // Ollama doesn't require an API key
    if (activeProvider === 'ollama') {
      return true;
    }

    // Check if active provider has an API key
    const config = this.getProviderConfig(activeProvider);
    return !!(config?.apiKey && config.apiKey.length > 0);
  }

  /**
   * Updates configuration for a provider.
   */
  async setProviderConfig(
    provider: LlmProviderType,
    config: Partial<LlmProviderConfig>
  ): Promise<void> {
    // Create or update provider config
    const existing = this.settings.providers[provider] || {
      provider,
      ...DEFAULT_PROVIDER_CONFIGS[provider],
    };

    this.settings.providers[provider] = {
      ...existing,
      ...config,
      provider,
    } as LlmProviderConfig;

    await this.saveSettings();
  }

  /**
   * Sets the API key for a provider.
   * If storage consent is given, encrypts and stores persistently.
   * Otherwise, stores in session only.
   */
  async setApiKey(provider: LlmProviderType, apiKey: string): Promise<void> {
    const config = this.settings.providers[provider] || {
      provider,
      ...DEFAULT_PROVIDER_CONFIGS[provider],
    };

    // Store the API key
    if (this.settings.storageConsent && this.settings.storageMode === 'persistent') {
      // Encrypt for persistent storage
      const encrypted = await this.encryptApiKey(apiKey);
      (config as any)._encryptedKey = encrypted;
      (config as any).apiKey = apiKey; // Keep in memory
    } else {
      // Session only - just keep in memory
      (config as any).apiKey = apiKey;
    }

    this.settings.providers[provider] = config as LlmProviderConfig;
    await this.saveSettings();
  }

  /**
   * Gets the API key for a provider (decrypted if necessary).
   */
  async getApiKey(provider: LlmProviderType): Promise<string | undefined> {
    const config = this.settings.providers[provider];
    if (!config) return undefined;

    // If we have a plaintext key in memory, return it
    if (config.apiKey) {
      return config.apiKey;
    }

    // Try to decrypt stored key
    const encrypted = (config as any)._encryptedKey;
    if (encrypted) {
      try {
        return await this.decryptApiKey(encrypted);
      } catch (e) {
        console.warn('Failed to decrypt API key:', e);
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Clears the API key for a provider.
   */
  async clearApiKey(provider: LlmProviderType): Promise<void> {
    const config = this.settings.providers[provider];
    if (config) {
      delete config.apiKey;
      delete (config as any)._encryptedKey;
      await this.saveSettings();
    }
  }

  /**
   * Checks if a provider is configured with an API key.
   */
  isProviderConfigured(provider: LlmProviderType): boolean {
    return isProviderConfigured(this.getProviderConfig(provider));
  }

  /**
   * Checks if the active provider is configured.
   */
  isActiveProviderConfigured(): boolean {
    return this.isProviderConfigured(this.settings.activeProvider);
  }

  /**
   * Gets storage consent status.
   */
  hasStorageConsent(): boolean {
    return this.settings.storageConsent;
  }

  /**
   * Sets storage consent and mode.
   */
  async setStorageConsent(
    consent: boolean,
    mode: 'persistent' | 'session' = 'session'
  ): Promise<void> {
    this.settings.storageConsent = consent;
    this.settings.storageMode = mode;

    if (!consent) {
      // Clear all encrypted keys if consent is revoked
      for (const provider of Object.keys(this.settings.providers) as LlmProviderType[]) {
        delete (this.settings.providers[provider] as any)?._encryptedKey;
      }
    }

    await this.saveSettings();
  }

  /**
   * Clears all settings and resets to defaults.
   */
  clearAll(): void {
    this.settings = { ...DEFAULT_LLM_SETTINGS };
    this.getStorage().removeItem(STORAGE_KEY);
  }

  /**
   * Exports settings for backup (without API keys).
   */
  exportSettings(): Partial<LlmSettings> {
    const exported: Partial<LlmSettings> = {
      activeProvider: this.settings.activeProvider,
      providers: {},
    };

    // Export provider configs without sensitive data
    for (const [provider, config] of Object.entries(this.settings.providers)) {
      if (config) {
        const { apiKey, ...safeConfig } = config as any;
        delete safeConfig._encryptedKey;
        exported.providers![provider as LlmProviderType] = safeConfig;
      }
    }

    return exported;
  }

  /**
   * Imports settings from backup.
   */
  async importSettings(settings: Partial<LlmSettings>): Promise<void> {
    if (settings.activeProvider) {
      this.settings.activeProvider = settings.activeProvider;
    }

    if (settings.providers) {
      for (const [provider, config] of Object.entries(settings.providers)) {
        if (config) {
          // Preserve existing API keys
          const existingKey = await this.getApiKey(provider as LlmProviderType);
          this.settings.providers[provider as LlmProviderType] = {
            ...config,
            apiKey: existingKey,
          } as LlmProviderConfig;
        }
      }
    }

    await this.saveSettings();
  }

  // ============ Private Methods ============

  /**
   * Gets the appropriate storage (localStorage or sessionStorage).
   */
  private getStorage(): Storage {
    return this.useSessionStorage ? sessionStorage : localStorage;
  }

  /**
   * Loads settings from storage.
   */
  private loadSettings(): LlmSettings {
    try {
      const stored = this.getStorage().getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_LLM_SETTINGS,
          ...parsed,
        };
      }
    } catch (e) {
      console.warn('Failed to load LLM settings:', e);
    }

    return { ...DEFAULT_LLM_SETTINGS };
  }

  /**
   * Saves settings to storage.
   */
  private async saveSettings(): Promise<void> {
    try {
      // Create a copy for storage
      const toStore: any = {
        ...this.settings,
        lastUsed: Date.now(),
      };

      // Remove plaintext API keys from stored version
      if (toStore.providers) {
        toStore.providers = { ...toStore.providers };
        for (const provider of Object.keys(toStore.providers)) {
          if (toStore.providers[provider]) {
            const config = { ...toStore.providers[provider] };
            // Keep encrypted key, remove plaintext
            if (!this.settings.storageConsent || this.settings.storageMode === 'session') {
              delete config.apiKey;
              delete config._encryptedKey;
            } else {
              delete config.apiKey; // Only store encrypted
            }
            toStore.providers[provider] = config;
          }
        }
      }

      this.getStorage().setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save LLM settings:', e);
    }
  }

  /**
   * Gets or creates the encryption key.
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.cryptoKey) {
      return this.cryptoKey;
    }

    // Try to load existing key from IndexedDB
    try {
      const stored = await this.loadKeyFromIndexedDB();
      if (stored) {
        this.cryptoKey = stored;
        return stored;
      }
    } catch (e) {
      console.warn('Failed to load encryption key:', e);
    }

    // Generate new key
    this.cryptoKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );

    // Store for future use
    await this.saveKeyToIndexedDB(this.cryptoKey);

    return this.cryptoKey;
  }

  /**
   * Encrypts an API key.
   */
  private async encryptApiKey(apiKey: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encoder.encode(apiKey)
    );

    // Combine IV and ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypts an API key.
   */
  private async decryptApiKey(encrypted: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const combined = new Uint8Array(
      atob(encrypted)
        .split('')
        .map((c) => c.charCodeAt(0))
    );

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Loads the encryption key from IndexedDB.
   */
  private loadKeyFromIndexedDB(): Promise<CryptoKey | null> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open('sdrf_llm_keys', 1);

        request.onerror = () => resolve(null);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('keys')) {
            db.createObjectStore('keys');
          }
        };

        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction('keys', 'readonly');
          const store = transaction.objectStore('keys');
          const getRequest = store.get(ENCRYPTION_KEY_NAME);

          getRequest.onerror = () => {
            db.close();
            resolve(null);
          };

          getRequest.onsuccess = () => {
            db.close();
            resolve(getRequest.result || null);
          };
        };
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Saves the encryption key to IndexedDB.
   */
  private saveKeyToIndexedDB(key: CryptoKey): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('sdrf_llm_keys', 1);

        request.onerror = () => reject(new Error('Failed to open IndexedDB'));

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('keys')) {
            db.createObjectStore('keys');
          }
        };

        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction('keys', 'readwrite');
          const store = transaction.objectStore('keys');
          store.put(key, ENCRYPTION_KEY_NAME);

          transaction.oncomplete = () => {
            db.close();
            resolve();
          };

          transaction.onerror = () => {
            db.close();
            reject(new Error('Failed to save key'));
          };
        };
      } catch (e) {
        reject(e);
      }
    });
  }
}

// Export singleton instance
export const llmSettingsService = new LlmSettingsService();
