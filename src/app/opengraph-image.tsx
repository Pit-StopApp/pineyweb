import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Piney Web Co. — Websites built to bring you customers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F5F0E8",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Pine tree shapes — left cluster */}
        {[0, 1, 2].map((i) => (
          <div
            key={`left-${i}`}
            style={{
              position: "absolute",
              left: 40 + i * 50,
              bottom: 60 + i * 20,
              width: 0,
              height: 0,
              borderLeft: `${28 - i * 4}px solid transparent`,
              borderRight: `${28 - i * 4}px solid transparent`,
              borderBottom: `${70 - i * 10}px solid rgba(74,124,89,${0.06 + i * 0.02})`,
              display: "flex",
            }}
          />
        ))}
        {/* Pine tree shapes — right cluster */}
        {[0, 1, 2].map((i) => (
          <div
            key={`right-${i}`}
            style={{
              position: "absolute",
              right: 50 + i * 55,
              bottom: 50 + i * 25,
              width: 0,
              height: 0,
              borderLeft: `${30 - i * 5}px solid transparent`,
              borderRight: `${30 - i * 5}px solid transparent`,
              borderBottom: `${75 - i * 12}px solid rgba(74,124,89,${0.05 + i * 0.02})`,
              display: "flex",
            }}
          />
        ))}

        {/* Woodgrain horizontal lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={`grain-${i}`}
            style={{
              position: "absolute",
              top: 80 + i * 120,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: `rgba(139,94,60,${0.04 + i * 0.01})`,
              display: "flex",
            }}
          />
        ))}

        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            backgroundColor: "#4A7C59",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0,
          }}
        >
          {/* Logo mark — simple pine diamond */}
          <div
            style={{
              width: 48,
              height: 48,
              backgroundColor: "#4A7C59",
              transform: "rotate(45deg)",
              marginBottom: 32,
              borderRadius: 4,
              display: "flex",
            }}
          />

          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#4A7C59",
              fontFamily: "serif",
              letterSpacing: "-2px",
              lineHeight: 1,
              display: "flex",
            }}
          >
            Piney Web Co.
          </div>

          <div
            style={{
              fontSize: 28,
              color: "#8B5E3C",
              fontFamily: "serif",
              fontStyle: "italic",
              marginTop: 20,
              display: "flex",
            }}
          >
            Websites built to bring you customers.
          </div>
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            fontSize: 18,
            color: "#A0998F",
            fontFamily: "serif",
            letterSpacing: "3px",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          pineyweb.com
        </div>
      </div>
    ),
    { ...size }
  );
}
