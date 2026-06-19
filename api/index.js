import express from 'express';

const app = express();

// Explicit CORS handler that runs for every request
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Expose-Headers', 'Content-Length');
  res.header('Access-Control-Allow-Headers', 'Accept, Accept-Language, Content-Language, Content-Type, Authorization');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

app.use(express.json());

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ==================== AUTH ENDPOINTS ====================
app.post('/api/auth/signup', (req, res) => {
  res.json({ message: 'Signup - Phase 1' });
});

app.post('/api/auth/login', (req, res) => {
  res.json({ message: 'Login - Phase 1' });
});

// ==================== PLACEHOLDER ENDPOINTS ====================
app.get('/api/workspaces/:id/opponents', (req, res) => {
  res.json([]);
});

app.post('/api/workspaces/:id/opponents', (req, res) => {
  res.json({ id: '1', name: 'Test Opponent' });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
