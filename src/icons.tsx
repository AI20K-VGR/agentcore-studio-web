/**
 * Bộ icon SVG inline dùng chung — thay toàn bộ emoji (✗✓▶🚀✅⏸⚠📎) từng rải rác trong JSX.
 * Mỗi icon 1 function component nhỏ, `currentColor` để ăn theo token màu qua CSS (`style.color`),
 * `size` mặc định 18px, `strokeWidth` cố định 1.6 cho đồng nhất toàn bộ set.
 */

interface IconProps {
  size?: number;
  style?: React.CSSProperties;
}

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export function PlayIcon({ size = 18, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M7 4.5v15l13-7.5-13-7.5Z" />
    </svg>
  );
}

/** Publish — sóng phát (broadcast), không phải rocket-emoji-dịch-sang-icon: khớp nghĩa "phát bản
 * mới ra tenant", tránh cliché. */
export function BroadcastIcon({ size = 18, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4" />
      <path d="M5.1 5.1a9.6 9.6 0 0 0 0 13.8M18.9 5.1a9.6 9.6 0 0 1 0 13.8" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 18, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.2 10.8 14.7 15.8 9.5" />
    </svg>
  );
}

export function XCircleIcon({ size = 18, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

export function PauseCircleIcon({ size = 18, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 9v6M14 9v6" />
    </svg>
  );
}

export function WarningTriangleIcon({ size = 18, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M12 4.2 21 19H3L12 4.2Z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="16.7" r="0.15" fill="currentColor" />
    </svg>
  );
}

export function PaperclipIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M16.5 6.5 9 14a2.8 2.8 0 0 0 4 4l7-7a4.5 4.5 0 0 0-6.4-6.4l-7 7a6 6 0 0 0 8.5 8.5" />
    </svg>
  );
}

/** Tab "Canvas" — lưới nhỏ, gợi node-graph. */
export function GridIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

export function ChatBubbleIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M4 6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5V16.5H6a2 2 0 0 1-2-2v-8Z" />
    </svg>
  );
}

export function PeopleIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
      <path d="M15.5 6a2.6 2.6 0 0 1 0 5.1" />
      <path d="M17 14.6c2.3.4 3.9 2.3 3.9 4.9" />
    </svg>
  );
}

export function FolderIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M3.5 6.2a1.5 1.5 0 0 1 1.5-1.5h4l2 2.3h8a1.5 1.5 0 0 1 1.5 1.5v8.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V6.2Z" />
    </svg>
  );
}

export function DocumentIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 12.5h6M9 16h6" />
    </svg>
  );
}

export function BotIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <rect x="4.5" y="8.5" width="15" height="10" rx="2.4" />
      <path d="M12 8.5V5" />
      <circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.2" r="1.1" fill="currentColor" stroke="none" />
      <path d="M2.5 12v3M21.5 12v3" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M15 5.5 8.5 12l6.5 6.5" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

export function SunIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
    </svg>
  );
}

export function MoonIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M20 14.2a8.5 8.5 0 1 1-9.2-11 6.8 6.8 0 0 0 9.2 11Z" />
    </svg>
  );
}

export function MonitorIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.6" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}

export function UserIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5 19c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

export function MapIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function SettingsIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2.05 2.05 0 1 1-2.9 2.9l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V19.6a2.05 2.05 0 1 1-4.1 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2.05 2.05 0 1 1-2.9-2.9l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4.4a2.05 2.05 0 1 1 0-4.1h.1a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2.05 2.05 0 1 1 2.9-2.9l.06.06a1.7 1.7 0 0 0 1.87.34H10.6a1.7 1.7 0 0 0 1.03-1.56V4.4a2.05 2.05 0 1 1 4.1 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2.05 2.05 0 1 1 2.9 2.9l-.06.06a1.7 1.7 0 0 0-.34 1.87V10.6a1.7 1.7 0 0 0 1.56 1.03h.1a2.05 2.05 0 1 1 0 4.1h-.1a1.7 1.7 0 0 0-1.56 1.03Z" />
    </svg>
  );
}

export function CloseIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function KeyIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M11 12.5 19.5 4M16.5 7l2.5 2.5M13.5 10l2 2" />
    </svg>
  );
}

export function LogoutIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M9 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3" />
      <path d="M14 15.5 18.5 12 14 8.5" />
      <path d="M18.2 12H9" />
    </svg>
  );
}

/** Mark thương hiệu — 4 chấm quanh 1 chấm tâm, gợi "node kết nối" mà không sao chép trực tiếp
 * logo hình khối chuẩn nào. Dùng ở top bar mọi màn. */
export function AgentCoreMark({ size = 20, style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 6.1v3.6M12 14.3v3.6M6.1 12h3.6M14.3 12h3.6" strokeWidth="1.3" />
    </svg>
  );
}
