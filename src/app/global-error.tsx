"use client";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  console.error(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f4f5f7",
          color: "#1c2430",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 15, fontWeight: 600 }}>SeaDock could not be loaded</p>
          <p style={{ fontSize: 13, color: "#667085" }}>Reload the page to try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              height: 36,
              border: 0,
              borderRadius: 6,
              background: "#1858c7",
              color: "white",
              padding: "0 12px",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
