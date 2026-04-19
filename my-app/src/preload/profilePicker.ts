/**
 * Profile picker preload — contextBridge API for the profile picker renderer.
 *
 * Exposes a typed API surface on window.profilePickerAPI:
 *   - getProfiles: list all profiles
 *   - addProfile: create a new profile
 *   - selectProfile: select a profile and launch the browser
 *   - browseAsGuest: launch without a profile
 *   - getColors: get available profile colors
 */

import { contextBridge, ipcRenderer } from 'electron';

export interface Profile {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface ProfilePickerAPI {
  getProfiles: () => Promise<{ profiles: Profile[]; lastSelectedId: string | null }>;
  addProfile: (name: string, color: string) => Promise<Profile>;
  removeProfile: (id: string) => Promise<boolean>;
  selectProfile: (id: string) => Promise<void>;
  browseAsGuest: () => Promise<void>;
  getColors: () => Promise<readonly string[]>;
}

const api: ProfilePickerAPI = {
  getProfiles: async () => {
    console.debug('[profile-picker-preload] getProfiles');
    return ipcRenderer.invoke('profiles:get-all') as Promise<{ profiles: Profile[]; lastSelectedId: string | null }>;
  },

  addProfile: async (name: string, color: string) => {
    console.debug('[profile-picker-preload] addProfile', { name, color });
    return ipcRenderer.invoke('profiles:add', { name, color }) as Promise<Profile>;
  },

  removeProfile: async (id: string) => {
    console.debug('[profile-picker-preload] removeProfile', { id });
    return ipcRenderer.invoke('profiles:remove', { id }) as Promise<boolean>;
  },

  selectProfile: async (id: string) => {
    console.debug('[profile-picker-preload] selectProfile', { id });
    await ipcRenderer.invoke('profiles:select', { id });
  },

  browseAsGuest: async () => {
    console.debug('[profile-picker-preload] browseAsGuest');
    await ipcRenderer.invoke('profiles:browse-as-guest');
  },

  getColors: async () => {
    console.debug('[profile-picker-preload] getColors');
    return ipcRenderer.invoke('profiles:get-colors') as Promise<readonly string[]>;
  },
};

contextBridge.exposeInMainWorld('profilePickerAPI', api);
