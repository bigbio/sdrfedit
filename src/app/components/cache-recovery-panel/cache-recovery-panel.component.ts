/**
 * Cache Recovery Panel Component
 *
 * Shows cached tables and allows users to recover or discard them.
 * Displayed on app load if cached tables exist.
 */

import {
  Component,
  Output,
  EventEmitter,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  TableCacheService,
  tableCacheService,
  CacheMetadata,
} from '../../core/services/table-cache.service';

export interface RecoverCacheEvent {
  cacheId: string;
}

@Component({
  selector: 'cache-recovery-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="recovery-overlay">
      <div class="recovery-panel">
        <div class="panel-header">
          <h2>💾 Recover Your Work</h2>
          <p class="subtitle">Found {{ cachedTables().length }} unsaved file(s)</p>
        </div>

        <div class="panel-body">
          @if (cachedTables().length > 0) {
            <div class="cache-list">
              @for (cache of cachedTables(); track cache.id) {
                <div class="cache-item">
                  <div class="cache-icon">📄</div>
                  <div class="cache-info">
                    <div class="cache-name">{{ cache.fileName }}</div>
                    <div class="cache-meta">
                      {{ cache.sampleCount }} samples, {{ cache.columnCount }} columns
                    </div>
                    <div class="cache-meta">
                      {{ cache.changeCount }} change(s) • Last saved {{ formatTime(cache.lastModified) }}
                    </div>
                  </div>
                  <div class="cache-actions">
                    <button
                      class="btn btn-primary"
                      (click)="recoverCache(cache.id)"
                      title="Recover this file"
                    >
                      Recover
                    </button>
                    <button
                      class="btn btn-danger"
                      (click)="deleteCache(cache.id)"
                      title="Discard this cache"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              }
            </div>

            <div class="cache-summary">
              <div class="summary-text">
                Total cache size: {{ cacheSize() }}
              </div>
              <button class="btn btn-secondary" (click)="clearAll()">
                Clear All Caches
              </button>
            </div>
          } @else {
            <div class="empty-state">
              <p>All caches have been cleared.</p>
            </div>
          }
        </div>

        <div class="panel-footer">
          <button class="btn btn-secondary btn-large" (click)="dismiss.emit()">
            Start Fresh
          </button>
          <p class="hint">Or load a new file to begin</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .recovery-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    }

    .recovery-panel {
      background: white;
      border-radius: 8px;
      max-width: 700px;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    }

    .panel-header {
      padding: 24px 24px 16px;
      border-bottom: 2px solid #e0e0e0;
    }

    .panel-header h2 {
      margin: 0 0 8px;
      font-size: 24px;
      color: #1a1a1a;
    }

    .subtitle {
      margin: 0;
      font-size: 14px;
      color: #666;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
    }

    .cache-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .cache-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: #f8f9fa;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .cache-item:hover {
      border-color: #2196f3;
      box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2);
    }

    .cache-icon {
      font-size: 32px;
      flex-shrink: 0;
    }

    .cache-info {
      flex: 1;
      min-width: 0;
    }

    .cache-name {
      font-size: 15px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cache-meta {
      font-size: 12px;
      color: #666;
      margin-bottom: 2px;
    }

    .cache-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .cache-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }

    .summary-text {
      font-size: 13px;
      color: #666;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #999;
    }

    .panel-footer {
      padding: 16px 24px;
      border-top: 2px solid #e0e0e0;
      text-align: center;
    }

    .hint {
      margin: 8px 0 0;
      font-size: 12px;
      color: #999;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2196f3;
      color: white;
    }

    .btn-primary:hover {
      background: #1976d2;
    }

    .btn-secondary {
      background: #f5f5f5;
      color: #666;
      border: 1px solid #ccc;
    }

    .btn-secondary:hover {
      background: #e0e0e0;
    }

    .btn-danger {
      background: white;
      color: #d32f2f;
      border: 1px solid #d32f2f;
    }

    .btn-danger:hover {
      background: #d32f2f;
      color: white;
    }

    .btn-large {
      padding: 12px 32px;
      font-size: 14px;
    }
  `],
})
export class CacheRecoveryPanelComponent implements OnInit {
  @Output() recover = new EventEmitter<RecoverCacheEvent>();
  @Output() dismiss = new EventEmitter<void>();

  private cacheService: TableCacheService = tableCacheService;

  cachedTables = signal<CacheMetadata[]>([]);
  cacheSize = signal<string>('0 KB');

  ngOnInit(): void {
    this.loadCachedTables();
  }

  loadCachedTables(): void {
    const tables = this.cacheService.listCachedTables();
    this.cachedTables.set(tables);

    const size = this.cacheService.estimateCacheSize();
    this.cacheSize.set(this.cacheService.formatCacheSize(size));
  }

  recoverCache(cacheId: string): void {
    this.recover.emit({ cacheId });
  }

  deleteCache(cacheId: string): void {
    this.cacheService.deleteCache(cacheId);
    this.loadCachedTables();
  }

  clearAll(): void {
    if (confirm('Are you sure you want to discard all cached files? This cannot be undone.')) {
      this.cacheService.clearAllCaches();
      this.loadCachedTables();
    }
  }

  formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  }
}
