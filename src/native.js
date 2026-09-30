// The iPhone (and later Android) app's own features, through Capacitor:
// haptics, the share sheet, saving files, due-date notifications and Face ID.
// Each one does nothing (or falls back to the web way) in a browser, so the
// website keeps working exactly as before.
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();

// ---- Haptics: a light tap for choices, a success/warning buzz for saves ----
export async function hapticTap() {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* no haptics on this device */
  }
}
export async function hapticResult(ok = true) {
  if (!isNative) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: ok ? NotificationType.Success : NotificationType.Error });
  } catch {
    /* no haptics on this device */
  }
}

// ---- Sharing text (invites) through the phone's share sheet ----
// Returns true when the sheet was shown (or the person cancelled it).
export async function shareText(title, text) {
  if (!isNative) return false;
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, dialogTitle: title });
    return true;
  } catch (e) {
    // Cancelling the sheet also lands here; that still counts as handled.
    return !!(e && /cancel/i.test(String(e.message || e)));
  }
}

// ---- Saving a file: in the app, write it and offer the share sheet ("Save to
// Files", AirDrop, Mail…), since a web download doesn't work inside an app ----
export async function saveFileNative(name, text) {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const written = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: name, files: [written.uri], dialogTitle: name });
  } catch (e) {
    if (!/cancel/i.test(String((e && e.message) || e))) throw e;
  }
}

// ---- Due-date reminders as notifications ----
// `events` are the same as the calendar file's: { title, day } repeating
// monthly, or { title, date: "YYYY-MM-DD" } once. Each alert comes at 9 am the
// day before (on the day itself for a debt due on the 1st). Replaces any
// reminders set before. Returns how many were set, or null if not allowed.
export async function setReminders(events) {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return null;
  await clearReminders();
  const now = new Date();
  const list = [];
  events.forEach((ev, i) => {
    const id = 1000 + i;
    const body = "Tap to record it in Kaayi.";
    if (ev.date) {
      const [y, m, d] = ev.date.split("-").map(Number);
      const at = new Date(y, m - 1, d - 1, 9, 0, 0);
      if (at > now) list.push({ id, title: ev.title, body, schedule: { at, allowWhileIdle: true } });
    } else if (ev.day) {
      const day = Math.min(ev.day > 1 ? ev.day - 1 : 1, 28);
      list.push({ id, title: ev.title, body, schedule: { on: { day, hour: 9, minute: 0 }, repeats: true, allowWhileIdle: true } });
    }
  });
  // iOS keeps at most 64 pending notifications per app.
  const batch = list.slice(0, 64);
  if (batch.length) await LocalNotifications.schedule({ notifications: batch });
  return batch.length;
}
export async function clearReminders() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
}
export async function remindersSet() {
  if (!isNative) return 0;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    return (await LocalNotifications.getPending()).notifications.length;
  } catch {
    return 0;
  }
}

// ---- Face ID / Touch ID lock ----
const LOCK_KEY = "kaayi-lock";
export function lockEnabled() {
  try {
    return isNative && localStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
}
export function setLockEnabled(on) {
  try {
    localStorage.setItem(LOCK_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}
// What this phone offers: "Face ID", "Touch ID", "your passcode", or null.
export async function biometricKind() {
  if (!isNative) return null;
  try {
    const { NativeBiometric, BiometryType } = await import("@capgo/capacitor-native-biometric");
    const r = await NativeBiometric.isAvailable({ useFallback: true });
    if (!r.isAvailable) return null;
    return r.biometryType === BiometryType.FACE_ID
      ? "Face ID"
      : r.biometryType === BiometryType.TOUCH_ID
      ? "Touch ID"
      : "your passcode";
  } catch {
    return null;
  }
}
// Asks for Face ID (falling back to the phone's passcode). Resolves true when it passed.
export async function verifyOwner(reason = "Unlock Kaayi") {
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.verifyIdentity({ reason, title: "Unlock Kaayi", useFallback: true });
    return true;
  } catch {
    return false;
  }
}
// Calls `onLeave` / `onReturn` as the app goes to the background and comes back.
export async function watchAppState(onLeave, onReturn) {
  if (!isNative) return () => {};
  const { App } = await import("@capacitor/app");
  const handle = await App.addListener("appStateChange", ({ isActive }) => (isActive ? onReturn() : onLeave()));
  return () => handle.remove();
}
