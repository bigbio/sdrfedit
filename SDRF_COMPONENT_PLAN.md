# Standalone SDRF Editor Web Component Plan

## 1. Executive Summary

**Objective:** Develop a standalone, framework-agnostic Web Component (Custom Element) that provides a full-featured SDRF (Sample and Data Relationship Format) editor.

**Key Characteristics:**
*   **Browser-Only:** All parsing, validation, and editing logic runs entirely within the user's browser.
*   **No Backend Dependency:** Removes reliance on the Python backend (`cupcake-vanilla`) for file processing or ontology lookups.
*   **No Authentication:** Open access; no login or user credentials required.
*   **Embeddable:** Can be dropped into any HTML page or framework (React, Vue, plain HTML).
*   **Auto-Load:** Supports loading an SDRF file via a URL parameter.

## 2. Source Repositories

This plan is based on the refactoring and adaptation of the existing full-stack architecture into a client-side library.

*   **Frontend Repository (Source):** `https://github.com/noatgnu/cupcake-vanilla-ng`
    *   *Role:* Source of UI components (`SdrfAgeInput`, `SdrfModificationInput`), SDRF Syntax logic, and general styling.
*   **Backend Repository (Reference):** `https://github.com/noatgnu/cupcake_vanilla`
    *   *Role:* Current provider of SDRF parsing and complex validation logic. This logic must be ported to TypeScript/JavaScript for the web component.

## 3. Architecture & Tech Stack

### 3.1. Core Technology
*   **Framework:** **Angular Elements** (part of Angular).
    *   *Rationale:* Allows reuse of the sophisticated Angular components (Input fields, Syntax Highlighting, Modal logic) already present in `cupcake-vanilla-ng` while outputting a standard native Web Component (`<sdrf-editor>`).
*   **State Management:** Angular Signals (already used in the project) for local component state.

### 3.2. Data Flow (Browser-Only)

**Current Flow (To be replaced):**
`UI -> Angular Service -> Python Backend -> EBI OLS API / File System`

**New Flow:**
1.  **Parsing:** `PapaParse` (or similar TSV parser) + Custom TS Logic -> In-Memory Object Model.
2.  **Ontology:** `Browser fetch()` -> **EBI OLS REST API** (Directly).
3.  **Storage:** In-memory modification. Export generates a `Blob` for browser download.

## 4. Key Modules & Refactoring Strategy

### 4.1. File Parsing (Backend -> Frontend)
*   **Current Status:** `metadata-management.ts` uploads files to a Python endpoint for parsing.
*   **Migration Plan:**
    *   Integrate a pure JavaScript TSV parser (e.g., `papaparse`).
    *   Port the column mapping logic from the backend to a new `SdrfParserService` in TypeScript.
    *   Reuse `projects/cupcake-vanilla/src/lib/models/sdrf-config.ts` for column definitions (`OFFICIAL_SDRF_COLUMNS`).

### 4.2. Ontology Lookup (Proxy -> Direct)
*   **Current Status:** `OntologySearchService` calls an internal API endpoint (`/ontology/search/suggest/`), which proxies to OLS.
*   **Migration Plan:**
    *   Create a `DirectOlsService` implementing the same interface as `OntologySearchService`.
    *   Implement direct calls to EBI OLS API: `https://www.ebi.ac.uk/ols4/api/`.
    *   *Note:* Ensure CORS handling is appropriate, though EBI OLS generally supports CORS.

### 4.3. SDRF Syntax & Validation
*   **Current Status:**
    *   Cell-level parsing (Age, Modification) is already in Frontend (`SdrfSyntaxService`).
    *   Row/Table-level validation is in Backend (`validateSdrfData`).
*   **Migration Plan:**
    *   **Keep:** `SdrfSyntaxService` (already pure TS).
    *   **Port:** Move validation rules (required columns, unique constraints) from Python to a new `SdrfValidationService`.

## 5. Implementation Roadmap

### Phase 1: Project Setup
1.  Create a new library project within the Angular monorepo: `projects/cupcake-sdrf-component`.
2.  Configure `@angular/elements` to build this project as a single `.js` file.

### Phase 2: Service Porting & Mocking
1.  **Refactor Services:** Extract `SdrfSyntaxService` and `SdrfColumnConfig` into a shared core independent of HTTP services.
2.  **Implement `DirectOlsService`:**
    ```typescript
    // Pseudo-code for direct OLS lookup
    search(query: string) {
       return fetch(`https://www.ebi.ac.uk/ols4/api/select?q=${query}&...`)
         .then(res => res.json());
    }
    ```
3.  **Implement `SdrfParserService`:** Handle TSV reading and validation in the browser.

### Phase 3: Component Development
1.  **Main Container:** Create `SdrfEditorComponent` that accepts an `@Input() url: string`.
2.  **Auto-Loading:** If `url` is present, `fetch(url)`, parse body, and load data into the table view.
3.  **Editing Interface:** Reuse existing `MetadataTableDetails` logic but stripped of "Save to Server" buttons; replace with "Export/Download".

### Phase 4: Build & Embed
1.  Register the component:
    ```typescript
    const el = createCustomElement(SdrfEditorComponent, { injector });
    customElements.define('sdrf-editor', el);
    ```
2.  Build script to concatenate polyfills and main bundle into `sdrf-editor.js`.

## 6. Usage Example

Once built, the component can be used in any HTML file:

```html
<!DOCTYPE html>
<html>
<head>
    <script src="sdrf-editor.js"></script>
    <!-- Bootstrap/Styles if not bundled -->
</head>
<body>
    
    <!-- Embed the editor -->
    <sdrf-editor 
        url="https://raw.githubusercontent.com/bigbio/proteomics-metadata-standard/master/annotated-projects/PXD000001/sdrf.tsv">
    </sdrf-editor>

</body>
</html>
```

## 7. Limitations & Considerations
*   **Large Files:** Browser-based parsing has memory limits (approx. 2GB tab limit). Very large SDRF files might be slow compared to backend streaming.
*   **CORS:** The server hosting the SDRF file (passed via `url`) must allow CORS requests from the domain hosting the editor.
*   **API Rate Limits:** Direct calls to EBI OLS from client browsers are subject to EBI's rate limits.
