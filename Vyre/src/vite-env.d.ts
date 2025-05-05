/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="@tauri-apps/api" />

import { Socket } from 'socket.io-client';

declare global {
  interface Window {
    globalSocket: Socket | null;
    socketConnections: number;
    app: any;
    __TAURI__?: {
      invoke: (cmd: string, args?: any) => Promise<any>;
      shell: {
        open: (path: string) => Promise<void>;
      };
      [key: string]: any;
    };
  }
}
