# PRD — Project Requirements Document: OPS - SIS

## 1. Overview
**OPS - SIS** adalah platform digital terintegrasi yang dirancang untuk mendigitalkan analisis peta kerawanan wilayah dan manajemen Rencana Kegiatan (Rengiat) di lingkungan kepolisian. Sistem ini bertujuan untuk mempercepat alur birokrasi persetujuan rencana operasional dari tingkat Satwil (POLRES/POLSEK) ke tingkat Polda, dengan dukungan Artificial Intelligence (AI) sebagai asisten audit dan perumusan strategi taktis.

## 2. Requirements
- **Mobile-Friendly & Responsive:** Antarmuka harus dioptimalkan untuk perangkat mobile guna memudahkan anggota di lapangan.
- **Role-Based Access Control (RBAC):** Membedakan akses untuk POLSEK, POLRES, POLDA, dan KABO (Kepala Biro Operasi).
- **Real-time Synchronization:** Status Rengiat harus terbarui secara instan di semua level setelah disetujui.
- **AI-Assisted Analysis:** Integrasi AI untuk menganalisis kecocokan antara jenis kejahatan di titik rawan dengan rencana kegiatan yang diusulkan.
- **Lightweight Performance:** Sistem harus berjalan lancar dengan beban server yang minim menggunakan arsitektur SvelteKit.

## 3. Core Features
1.  **Dashboard Peta Kerawanan (OpenStreetMap)**
    - POLRES dapat menentukan titik koordinat rawan kejahatan melalui peta.
    - Input jenis kejahatan (C3, Narkoba, Tawuran, dll) dan tingkat frekuensi.
2.  **Manajemen Rengiat & AI Integration**
    - Upload draf Rengiat oleh POLRES.
    - **AI Auditor:** Menganalisis draf dan memberikan saran revisi jika rencana dianggap tidak relevan dengan jenis kejahatan di lokasi tersebut.
    - **AI Generator:** Membuat 1 usulan rencana kegiatan taktis alternatif bagi Admin POLDA.
3.  **Alur Persetujuan (Approval Workflow)**
    - Verifikasi oleh Admin POLDA dan persetujuan final (ACC) oleh KABO.
    - Notifikasi real-time ke tingkat POLRES/POLSEK setelah Rengiat disetujui.
4.  **Pelaporan Giat (Evidence-Based)**
    - POLSEK melaporkan hasil kegiatan berdasarkan Rengiat yang disetujui.
    - Input berupa laporan tertulis dan unggah foto (dengan kompresi otomatis).

## 4. User Flow

```mermaid
graph TD
    A[POLRES: Input Peta Rawan & Upload Rengiat] --> B{Sistem & AI}
    B -->|Analisis| C[AI: Evaluasi Draf & Generate Rekomendasi]
    C --> D[Admin POLDA: Review & Finalisasi]
    D --> E[KABO: Approval Final]
    E -->|Disetujui| F[Update Otomatis ke Unit Pelaksana]
    F --> G[POLSEK: Lapor Giat via Foto & Teks]
    G --> H[Dashboard Monitoring POLDA]

## 5. Architecture
SvelteKit digunakan sebagai framework full-stack (Frontend & Server-side Logic) untuk memastikan kecepatan pengembangan dan performa yang ringan.

sequenceDiagram
    participant User as User (Mobile)
    participant SK as SvelteKit (App)
    participant AI as AI Engine (Gemini/OpenAI)
    participant DB as MySQL Database
    participant S3 as Object Storage

    User->>SK: Submit Rengiat & Foto
    SK->>S3: Simpan Media
    SK->>AI: Request Analisis Strategis
    AI-->>SK: Return Saran & Draft Taktis
    SK->>DB: Simpan Status 'Pending'
    Note right of SK: KABO memberikan Approval
    SK->>DB: Update Status 'Active'
    SK->>User: Push Notifikasi Real-time

## 6. Database Schema
Tabel,Deskripsi
users,"Data personil (id, nama, pangkat, role, unit_id)"
vulnerability_points,"Koordinat peta, jenis kejahatan, dan polres_id"
rengiat,"Data rencana, status (Draft/Review/Approved), ai_analysis, final_plan"
activity_reports,"Laporan pelaksanaan (rengiat_id, user_id, foto_url, deskripsi, timestamp)"

## 7. Design & Technical Constraints
1.  **Visual Identity:**
    - Background: Putih bersih (#FFFFFF).

    - Primary Color: Biru Tua (#1E3A8A) — Otoritas & Profesionalisme.

    - Accent Color: Emas (#D4AF37) — Status penting, tombol utama, & badge approval.

    - UI Elements: Menggunakan Shadcn-Svelte untuk komponen yang modern dan ringan.

2. **Tech Stack:**

    - Framework: SvelteKit (Node.js/Bun runtime).

    - Database: MySQL.

    - Styling: Tailwind CSS.

    - Maps: Leaflet.js dengan Tile OpenStreetMap.

    - Typography:

    - Sans: Geist Mono, ui-monospace, monospace

    - Mono: JetBrains Mono, monospace

3. **Optimization:**

    - Implementasi Optimistic UI pada setiap aksi tombol.

    - Server-Sent Events (SSE) untuk update status Rengiat secara real-time tanpa polling manual.