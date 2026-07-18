# Private report storage and admin viewer

This application can persist generated PDFs in a private Supabase Storage bucket and list them at a password-protected administrator page. It works without Supabase too; in that mode reports remain available only in server memory for one hour.

## 1. Create the private bucket

In the Supabase dashboard, create a Storage bucket named `shadow-company-reports` and keep it **private**. Do not create a public read policy for this bucket.

## 2. Create the metadata table

Open the Supabase SQL editor and run:

```sql
create table if not exists public.generated_reports (
  id uuid primary key,
  company_name text not null,
  decision_status text not null,
  evidence_rating text not null,
  quality_score integer,
  provider text not null,
  filename text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.generated_reports enable row level security;
```

No public RLS policy is needed. The application uses the service-role key server-side; never expose that key to the browser.

## 3. Set server environment variables

Set these only in Railway, Render, or your server environment:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_REPORT_BUCKET=shadow-company-reports
SUPABASE_REPORT_TABLE=generated_reports
ADMIN_USERNAME=your-admin-name
ADMIN_PASSWORD=a-long-unique-password
```

Also keep the standard public-app variables:

```text
HOST=0.0.0.0
AI_PROVIDER=codex
ALLOW_CODEX_ACCOUNT_SERVER=true
```

## 4. View saved PDFs

After deployment, open:

```text
https://YOUR_DOMAIN/admin/reports
```

The browser will request the administrator username and password. The page lists up to 200 recent reports and opens each PDF through the server, without exposing the Supabase service key or making the storage bucket public.

## Notes

- Reports are stored only after a successful PDF generation.
- If Supabase is temporarily unavailable, the user still receives the normal temporary download link and the server records the storage failure without logging their business brief.
- Reports may include confidential company information. Set a retention policy and delete reports you no longer need.
