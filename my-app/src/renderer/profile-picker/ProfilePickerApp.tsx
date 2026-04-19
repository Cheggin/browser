/**
 * ProfilePickerApp.tsx — Profile picker window root component.
 *
 * Shows avatar cards per profile with name + color.
 * '+' button to add a new profile.
 * 'Browse as Guest' entry at the bottom.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal } from '../components/base';

// ---------------------------------------------------------------------------
// Types (mirror preload shape)
// ---------------------------------------------------------------------------

interface Profile {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

declare global {
  interface Window {
    profilePickerAPI: {
      getProfiles: () => Promise<{ profiles: Profile[]; lastSelectedId: string | null }>;
      addProfile: (name: string, color: string) => Promise<Profile>;
      removeProfile: (id: string) => Promise<boolean>;
      selectProfile: (id: string) => Promise<void>;
      browseAsGuest: () => Promise<void>;
      getColors: () => Promise<readonly string[]>;
    };
  }
}

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------

function ProfileAvatar({ name, color, size = 64 }: { name: string; color: string; size?: number }): React.ReactElement {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="pp-avatar"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: '50%',
        fontSize: size * 0.4,
      }}
    >
      {initial}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Profile Modal
// ---------------------------------------------------------------------------

function AddProfileModal({
  open,
  colors,
  onClose,
  onAdd,
}: {
  open: boolean;
  colors: readonly string[];
  onClose: () => void;
  onAdd: (name: string, color: string) => void;
}): React.ReactElement {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(colors[0] ?? '#6366f1');

  useEffect(() => {
    if (open) {
      setName('');
      setSelectedColor(colors[0] ?? '#6366f1');
    }
  }, [open, colors]);

  function handleSubmit(): void {
    if (!name.trim()) return;
    onAdd(name.trim(), selectedColor);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a profile" size="sm">
      <div className="pp-add-form">
        <div className="pp-add-field">
          <label htmlFor="pp-name-input" className="pp-add-label">Profile name</label>
          <input
            id="pp-name-input"
            className="pp-add-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Work, Personal"
            maxLength={40}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
        </div>

        <div className="pp-add-field">
          <span className="pp-add-label">Color</span>
          <div className="pp-color-grid">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                className={`pp-color-swatch ${selectedColor === c ? 'pp-color-swatch--selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setSelectedColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="pp-add-preview">
          <ProfileAvatar name={name || '?'} color={selectedColor} size={48} />
          <span className="pp-add-preview-name">{name || 'New Profile'}</span>
        </div>

        <div className="pp-add-actions">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

export function ProfilePickerApp(): React.ReactElement {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [colors, setColors] = useState<readonly string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfiles = useCallback(async () => {
    try {
      const [profileData, colorData] = await Promise.all([
        window.profilePickerAPI.getProfiles(),
        window.profilePickerAPI.getColors(),
      ]);
      setProfiles(profileData.profiles);
      setLastSelectedId(profileData.lastSelectedId);
      setColors(colorData);
      console.debug('[profile-picker] loaded profiles', {
        count: profileData.profiles.length,
        lastSelectedId: profileData.lastSelectedId,
      });
    } catch (err) {
      console.error('[profile-picker] failed to load profiles', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  async function handleSelectProfile(id: string): Promise<void> {
    console.debug('[profile-picker] selecting profile', { id });
    await window.profilePickerAPI.selectProfile(id);
  }

  async function handleBrowseAsGuest(): Promise<void> {
    console.debug('[profile-picker] browsing as guest');
    await window.profilePickerAPI.browseAsGuest();
  }

  async function handleAddProfile(name: string, color: string): Promise<void> {
    console.debug('[profile-picker] adding profile', { name, color });
    await window.profilePickerAPI.addProfile(name, color);
    setShowAddModal(false);
    await loadProfiles();
  }

  if (loading) {
    return (
      <div className="pp-root">
        <div className="pp-loading">Loading profiles…</div>
      </div>
    );
  }

  return (
    <div className="pp-root">
      <div className="pp-header">
        <h1 className="pp-title">Who's browsing?</h1>
        <p className="pp-subtitle">Choose a profile to get started</p>
      </div>

      <div className="pp-grid">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className={`pp-card ${lastSelectedId === profile.id ? 'pp-card--last' : ''}`}
            onClick={() => void handleSelectProfile(profile.id)}
          >
            <ProfileAvatar name={profile.name} color={profile.color} size={64} />
            <span className="pp-card-name">{profile.name}</span>
          </button>
        ))}

        <button
          type="button"
          className="pp-card pp-card--add"
          onClick={() => setShowAddModal(true)}
        >
          <div className="pp-avatar pp-avatar--add" style={{ width: 64, height: 64, borderRadius: '50%', fontSize: 28 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <span className="pp-card-name">Add</span>
        </button>
      </div>

      <div className="pp-footer">
        <button
          type="button"
          className="pp-guest-btn"
          onClick={() => void handleBrowseAsGuest()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="6" r="3" />
            <path d="M2 14c0-2.5 2.5-4 6-4s6 1.5 6 4" />
          </svg>
          Browse as Guest
        </button>
      </div>

      <AddProfileModal
        open={showAddModal}
        colors={colors}
        onClose={() => setShowAddModal(false)}
        onAdd={(name, color) => void handleAddProfile(name, color)}
      />
    </div>
  );
}

export default ProfilePickerApp;
