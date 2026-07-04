import { useEffect, useState } from "react";

// Dismissible analytics/cookies notice. Mount in the root layout ONLY if the
// site actually runs analytics; delete it otherwise. Plain <a> link — works
// with any router. Its localStorage use must be disclosed in the privacy
// policy (the kit's template already does).
const ANALYTICS_NOTICE_KEY = "analytics-notice-dismissed";

export function AnalyticsNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ANALYTICS_NOTICE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable (private mode) — skip the notice
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(ANALYTICS_NOTICE_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 inset-x-4 md:inset-x-auto md:left-4 md:max-w-sm z-50 rounded-2xl bg-primary text-primary-foreground shadow-lg p-4 text-xs sm:text-sm leading-relaxed"
    >
      <p>
        האתר משתמש בעוגיות ובכלי מדידה לשיפור חוויית הגלישה.{" "}
        <a href="/privacy" className="underline">
          למדיניות הפרטיות
        </a>
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="mt-2 rounded-full bg-primary-foreground text-primary px-4 py-1.5 text-xs font-medium"
      >
        הבנתי
      </button>
    </div>
  );
}
