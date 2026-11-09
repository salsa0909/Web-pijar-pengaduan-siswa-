import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const REPORTS_DB_FILE = path.join(DATA_DIR, 'reports_database.json');

function readReportsFromFile(): any[] {
  try {
    if (!fs.existsSync(REPORTS_DB_FILE)) {
      fs.writeFileSync(REPORTS_DB_FILE, JSON.stringify([], null, 2), 'utf-8');
      return [];
    }
    const raw = fs.readFileSync(REPORTS_DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[DATABASE] Error reading reports from file:', err);
    return [];
  }
}

function writeReportsToFile(reports: any[]): void {
  try {
    fs.writeFileSync(REPORTS_DB_FILE, JSON.stringify(reports, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DATABASE] Error writing reports to file:', err);
  }
}

app.get('/api/health', (_req, res) => {
  const reports = readReportsFromFile();
  res.json({
    status: 'ok',
    totalStoredReports: reports.length,
    databaseReady: true,
    time: new Date().toISOString()
  });
});

app.get('/api/reports', (req, res) => {
  try {
    const reports = readReportsFromFile();
    const sort = req.query.sort as string;
    const sorted = [...reports].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return sort === 'desc' ? timeB - timeA : timeA - timeB;
    });

    res.json({
      success: true,
      total: sorted.length,
      reports: sorted,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Gagal mengambil database pengaduan: ' + err.message });
  }
});

app.post('/api/reports', (req, res) => {
  try {
    const newReport = req.body;
    if (!newReport || !newReport.ticketCode || !newReport.description) {
      return res.status(400).json({ error: 'Data laporan tidak lengkap.' });
    }

    const reports = readReportsFromFile();
    const existingIndex = reports.findIndex((r) => r.ticketCode === newReport.ticketCode || r.id === newReport.id);
    if (existingIndex !== -1) {
      reports[existingIndex] = {
        ...reports[existingIndex],
        ...newReport,
        updatedAt: new Date().toISOString(),
      };
    } else {
      reports.push({
        ...newReport,
        createdAt: newReport.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    writeReportsToFile(reports);
    res.json({
      success: true,
      message: 'Laporan berhasil disimpan secara permanen di database.',
      report: newReport,
      total: reports.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Gagal menyimpan laporan: ' + err.message });
  }
});

app.post('/api/reports/reply', (req, res) => {
  try {
    const { reportId, ticketCode, replyText, status, adminName } = req.body;
    const reports = readReportsFromFile();
    const index = reports.findIndex((r) => r.id === reportId || r.ticketCode === ticketCode);

    if (index === -1) {
      return res.status(404).json({ error: 'Laporan tidak ditemukan di database.' });
    }

    reports[index] = {
      ...reports[index],
      status: status || reports[index].status,
      adminReply: replyText,
      repliedBy: adminName,
      repliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    writeReportsToFile(reports);
    res.json({
      success: true,
      message: 'Tanggapan berhasil disimpan.',
      report: reports[index],
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Gagal menyimpan tanggapan admin: ' + err.message });
  }
});

async function main() {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PIJAR] Server berjalan pada http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[PIJAR] Gagal menjalankan server:', err);
  process.exit(1);
});
