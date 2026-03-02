'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';

interface Admin {
  id: number;
  name: string;
  email: string;
  upi_id: string;
  qr_image_url: string;
  created_at: string;
}

export default function Profile() {
  const router = useRouter();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [formData, setFormData] = useState({ name: '', upi_id: '', qr_image_url: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    fetchProfile();
  }, [router]);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/auth/me');
      setAdmin(res.data);
      setFormData({
        name: res.data.name || '',
        upi_id: res.data.upi_id || '',
        qr_image_url: res.data.qr_image_url || '',
      });
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch('/auth/me', formData);
      setAdmin(res.data.admin);
      localStorage.setItem('admin', JSON.stringify(res.data.admin));
      toast.success('Profile updated successfully');
      setEditMode(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (admin) {
      setFormData({ name: admin.name, upi_id: admin.upi_id || '', qr_image_url: admin.qr_image_url || '' });
    }
    setEditMode(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('New passwords do not match');
      return;
    }
    if (pwForm.new_password.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    setPwLoading(true);
    try {
      await api.patch('/auth/me', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      toast.success('Password changed successfully!');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setShowPw(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  if (loading) return <div className="text-center mt-20 text-muted-foreground">Loading profile...</div>;
  if (!admin) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground">My Profile</h1>

      {/* Profile Info Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">
                {admin.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{admin.name}</h2>
              <p className="text-muted-foreground text-sm">{admin.email}</p>
              <p className="text-xs text-muted-foreground/70">Member since {new Date(admin.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          {!editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Edit Profile
            </button>
          )}
        </div>

        {!editMode ? (
          /* View Mode */
          <div className="space-y-4 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Full Name</p>
                <p className="text-foreground font-medium">{admin.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Email</p>
                <p className="text-foreground font-medium">{admin.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium mb-1">UPI ID</p>
                <p className="text-foreground font-medium font-mono">
                  {admin.upi_id || <span className="text-muted-foreground italic">Not set</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium mb-1">QR Image URL</p>
                <p className="text-foreground font-medium truncate">
                  {admin.qr_image_url || <span className="text-muted-foreground italic">Not set</span>}
                </p>
              </div>
            </div>

            {admin.qr_image_url && (
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground uppercase font-medium mb-2">QR Code Preview</p>
                <img
                  src={admin.qr_image_url}
                  alt="UPI QR Code"
                  className="w-40 h-40 object-contain border border-border rounded-lg p-1"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
          </div>
        ) : (
          /* Edit Mode */
          <form onSubmit={handleSave} className="space-y-4 border-t border-border pt-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
              <input
                type="text"
                required
                className="w-full rounded-lg border border-input bg-background text-foreground p-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input
                type="email"
                disabled
                className="w-full rounded-lg border border-input p-2.5 text-sm text-muted-foreground bg-muted cursor-not-allowed"
                value={admin.email}
              />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">UPI ID</label>
              <input
                type="text"
                className="w-full rounded-lg border border-input bg-background text-foreground p-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none font-mono"
                value={formData.upi_id}
                placeholder="yourname@upi"
                onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">This UPI ID is used to generate the QR code for students</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">QR Image URL <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input
                type="url"
                className="w-full rounded-lg border border-input bg-background text-foreground p-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                value={formData.qr_image_url}
                placeholder="https://..."
                onChange={(e) => setFormData({ ...formData, qr_image_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Upload your QR image somewhere and paste the link here</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Change Password Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-base font-semibold text-foreground">Change Password</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Update your account password</p>
          </div>
          {!showPw && (
            <button
              onClick={() => setShowPw(true)}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Change Password
            </button>
          )}
        </div>

        {showPw && (
          <form onSubmit={handlePasswordChange} className="space-y-4 border-t border-border mt-4 pt-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  className="w-full rounded-lg border border-input bg-background text-foreground p-2.5 pr-10 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                  placeholder="Enter current password"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-input bg-background text-foreground p-2.5 pr-10 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                  placeholder="At least 6 characters"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowNew(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  className="w-full rounded-lg border border-input bg-background text-foreground p-2.5 pr-10 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                  value={pwForm.confirm_password}
                  onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                  placeholder="Re-enter new password"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {pwForm.confirm_password && pwForm.new_password !== pwForm.confirm_password && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={pwLoading}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
              <button
                type="button"
                onClick={() => { setShowPw(false); setPwForm({ current_password: '', new_password: '', confirm_password: '' }); setShowCurrent(false); setShowNew(false); setShowConfirm(false); }}
                className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
