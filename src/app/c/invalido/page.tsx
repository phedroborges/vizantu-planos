export const metadata = { title: "Link inválido — Vizantu" };

export default async function InvalidTokenPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const isConfig = motivo === "config";

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#101010", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>
          {isConfig ? "Não conseguimos carregar seu painel agora" : "Este link não é mais válido"}
        </h1>
        <p style={{ opacity: 0.75, fontSize: 14, lineHeight: 1.6 }}>
          {isConfig
            ? "Já avisamos o time da Vizantu — é uma instabilidade nossa, não algo que você tenha feito. Tente de novo em alguns minutos."
            : "O link pode ter expirado ou sido revogado. Fale com o time da Vizantu pra receber um novo link de acesso ao seu painel."}
        </p>
      </div>
    </main>
  );
}
