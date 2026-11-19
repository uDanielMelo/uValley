# Save na nuvem e fazendas da comunidade (Supabase)

O jogo funciona sem servidor. A seção ☁️ Nuvem do painel Perfil só aparece pronta para uso quando um projeto
Supabase está configurado. O cliente (`src/services/cloud.ts`) usa a API REST do Supabase direto, sem SDK.

## 1. Projeto e login com GitHub

1. Crie um projeto em https://supabase.com.
2. Em **Authentication → Providers → GitHub**, ative o provedor. Crie um OAuth App no GitHub
   (Settings → Developer settings → OAuth Apps) com o callback que o Supabase mostra
   (`https://<projeto>.supabase.co/auth/v1/callback`) e cole o Client ID e o Secret no Supabase.
3. Em **Authentication → URL Configuration**, adicione as URLs do jogo em Redirect URLs
   (por exemplo `http://localhost:5173/` e a URL publicada).

## 2. Tabelas (SQL Editor)

```sql
create table public.saves (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data text not null,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  day integer not null,
  money integer not null,
  animals integer not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;
alter table public.profiles enable row level security;

-- Cada jogador lê e grava só o próprio save.
create policy "own save" on public.saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Os cards de fazenda são públicos para quem está logado; cada um grava só o seu.
create policy "read profiles" on public.profiles for select using (auth.role() = 'authenticated');
create policy "write own profile" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at em cada gravação
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger saves_touch before update on public.saves for each row execute function public.touch();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch();
```

## 3. Variáveis do jogo

Crie um `.env.local` na raiz (o `.gitignore` já ignora `.env.*`):

```
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon pública>
```

Reinicie o `npm run dev`. No painel Perfil (🐙), "Entrar com GitHub" leva ao login e volta ao jogo; daí dá
para salvar e carregar a fazenda na nuvem e ver as fazendas da comunidade.

## Ainda não feito

- Amigos (seguir jogadores e visitar a fazenda deles em modo de leitura): precisa de uma tabela de amizades e
  de uma vista de fazenda alheia.
- Bônus do GitHub a partir do login (hoje ele lê a atividade pública pelo nome de usuário, sem login).
