import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAuthenticated()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand"><span className="brand-mark">VZ</span><span>Vizantu Planos<small>Apresentações compartilháveis</small></span></div>
        <div className="login-copy">
          <span className="eyebrow">Publicar ficou simples</span>
          <h1>Do HTML ao cliente em <strong>um envio.</strong></h1>
          <p>Organize aprovações, publique páginas completas e compartilhe um endereço limpo com cada cliente.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        <div className="login-card">
          <span className="eyebrow">Acesso administrativo</span>
          <h2>Entrar no painel</h2>
          <p>Use a senha configurada para a equipe da Vizantu.</p>
          <form action="/api/login" method="post">
            <div className="field"><label htmlFor="password">Senha</label><input id="password" name="password" type="password" autoComplete="current-password" required autoFocus /></div>
            {error ? <div className="form-message">Senha incorreta. Tente novamente.</div> : null}
            <button className="primary-button" type="submit">Entrar</button>
          </form>
          <p className="login-hint">O upload fica protegido. Os planos publicados continuam acessíveis pelo link compartilhado.</p>
        </div>
      </section>
    </main>
  );
}
