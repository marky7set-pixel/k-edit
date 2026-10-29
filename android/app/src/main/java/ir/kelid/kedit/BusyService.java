package ir.kelid.kedit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Keeps K-Edit working while the screen is off: a quiet notification with the progress and a CPU wake lock. */
public class BusyService extends Service {
    private static final String CH = "kedit_busy";
    private static final int ID = 7;
    private PowerManager.WakeLock lock;

    static void update(Context c, boolean on, int pct, String title) {
        Intent i = new Intent(c, BusyService.class);
        if (!on) { c.stopService(i); return; }
        i.putExtra("pct", pct); i.putExtra("title", title);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Throwable ignored) { }
    }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        int pct = i == null ? -1 : i.getIntExtra("pct", -1);
        String title = i == null ? null : i.getStringExtra("title");
        Notification n = build(title == null || title.isEmpty() ? "در حال پخت و پز" : title, pct);
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(ID, n);
        } catch (Throwable e) { stopSelf(); return START_NOT_STICKY; }
        if (lock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kedit:build");
            lock.setReferenceCounted(false);
            lock.acquire(6 * 60 * 60 * 1000L);
        }
        return START_NOT_STICKY;
    }

    private Notification build(String title, int pct) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "ساخت فایل", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            b = new Notification.Builder(this, CH);
        } else b = new Notification.Builder(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setOngoing(true).setOnlyAlertOnce(true).setContentIntent(pi)
                .setContentText(pct >= 0 ? "٪" + toFa(pct) + " انجام شد" : "کمی صبر کنید…")
                .setProgress(100, Math.max(0, pct), pct < 0);
        return b.build();
    }

    private static String toFa(int n) {
        String s = String.valueOf(n); StringBuilder o = new StringBuilder();
        for (char c : s.toCharArray()) o.append(c >= '0' && c <= '9' ? (char) ('۰' + (c - '0')) : c);
        return o.toString();
    }

    @Override
    public void onDestroy() {
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) { return null; }
}
