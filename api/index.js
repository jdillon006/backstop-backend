import express from 'express';
import cors from 'cors';

const app = express();

// CORS - MUST BE FIRST
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }
  next();
});

app.use(express.json());
app.use(cors());

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ==================== PLACEHOLDER ====================
app.post('/api/auth/signup', (req, res) => {
  res.json({ message: 'Signup endpoint - Phase 1' });
});

app.post('/api/auth/login', (req, res) => {
  res.json({ message: 'Login endpoint - Phase 1' });
});

app.get('/api/workspaces/:id/opponents', (req, res) => {
  res.json([]);
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
