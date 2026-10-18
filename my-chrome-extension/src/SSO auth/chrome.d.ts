/**
 * chrome.d.ts — Chrome API Type Declarations
 *
 * This file tells TypeScript what shape the `chrome` browser API has.
 * Chrome extensions live inside the browser and get access to special APIs
 * (like opening a login popup or saving data) that normal websites don't have.
 * TypeScript doesn't know about these APIs by default, so this file describes them.
 *
 * run: npm install --save-dev @types/chrome
 */

declare namespace chrome {

  // ---- IDENTITY API --------------------------------------------------------
  namespace identity {

    interface TokenDetails {
      interactive?: boolean;
    }

    interface GetAuthTokenResult {
      token?: string;
      grantedScopes?: string[];
    }

    // Gets a Google OAuth access token configured in manifest.json.
    function getAuthToken(details?: TokenDetails): Promise<GetAuthTokenResult>;

  }

  // ---- STORAGE API ---------------------------------------------------------
  // The "storage" namespace lets the extension save and retrieve data.
  // It's similar to localStorage, but built specifically for extensions and
  // supports different storage areas with different lifetimes.
  namespace storage {

    // Defines the operations every storage area supports (get, set, remove, clear).
    interface StorageArea {
      get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
      // Controls which parts of the extension can read from session storage.
      setAccessLevel?(accessOptions: { accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }): Promise<void>;
    }

    // session = in-memory only; wiped when the browser closes. Best for access tokens.
    const session: StorageArea;
    // local = persists on disk across browser restarts. Used for refresh tokens if needed.
    const local: StorageArea;
    // sync = syncs across the user's Chrome profile on different devices. Not used here.
    const sync: StorageArea;
  }

  // ---- RUNTIME API ---------------------------------------------------------
  // The "runtime" namespace handles messaging between different parts of the
  // extension (e.g., the popup page talking to the background service worker).
  namespace runtime {
    // Fired when the extension is first installed, updated, or Chrome is updated.
    const onInstalled: {
      addListener(callback: (details: { reason: string; previousVersion?: string }) => void): void;
    };
    // If a Chrome API call failed, this will contain the error message.
    const lastError: { message?: string } | undefined;
    // The unique ID of this extension (used to verify message senders).
    const id: string;
    // Returns the installed extension manifest.
    function getManifest(): {
      oauth2?: {
        client_id?: string;
        scopes?: string[];
      };
    };
    // Sends a message to another part of the extension.
    function sendMessage(message: any, responseCallback?: (response: any) => void): Promise<any>;
    // Listens for messages sent by other parts of the extension.
    const onMessage: {
      addListener(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void): void;
    };
  }
}
