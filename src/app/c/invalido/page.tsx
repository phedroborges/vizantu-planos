export const metadata = { title: "Link inválido — Vizantu" };

export default function InvalidTokenPage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#101010", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>Este link não é mais válido</h1>
        <p style={{ opacity: 0.75, fontSize: 14, lineHeight: 1.6 }}>
          O link pode ter expirado ou sido revogado. Fale com o time da Vizantu pra receber um novo link de acesso ao seu painel.
        </p>
      </div>
    </main>
  );
}
