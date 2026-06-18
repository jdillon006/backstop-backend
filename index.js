import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
const verifyAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== AUTH ENDPOINTS ====================

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, workspaceName } = req.body;
  
  try {
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUpWithPassword({
      email,
      password
    });
    
    if (authError) return res.status(400).json({ error: authError.message });
    
    const userId = authData.user.id;
    
    // Create workspace
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({
        owner_id: userId,
        name: workspaceName || `${email.split('@')[0]}'s Workspace`
      })
      .select()
      .single();
    
    if (wsError) return res.status(400).json({ error: wsError.message });
    
    // Create coach entry
    await supabase
      .from('coaches')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        email,
        role: 'owner'
      });
    
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, workspace, userId });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    
    const userId = data.user.id;
    
    // Get user's workspace
    const { data: coach } = await supabase
      .from('coaches')
      .select('workspace_id')
      .eq('user_id', userId)
      .single();
    
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, workspaceId: coach?.workspace_id, userId });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== WORKSPACE ENDPOINTS ====================

app.get('/api/workspaces/:id', verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) return res.status(404).json({ error: 'Workspace not found' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/workspaces/:id', verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== OPPONENTS ENDPOINTS ====================

app.get('/api/workspaces/:workspaceId/opponents', verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('opponents')
      .select('*')
      .eq('workspace_id', req.params.workspaceId)
      .order('created_at', { ascending: false });
    
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workspaces/:workspaceId/opponents', verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('opponents')
      .insert({
        workspace_id: req.params.workspaceId,
        name: req.body.name
      })
      .select()
      .single();
    
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== GAMES ENDPOINTS ====================

app.get('/api/opponents/:opponentId/games', verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('opponent_id', req.params.opponentId)
      .order('game_date', { ascending: false });
    
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opponents/:opponentId/games', verifyAuth, async (req, res) => {
  try {
    const { batting, pitching, gameDate, notes } = req.body;
    
    // Create game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        opponent_id: req.params.opponentId,
        game_date: gameDate,
        notes
      })
      .select()
      .single();
    
    if (gameError) return res.status(400).json({ error: gameError.message });
    
    // Insert batting logs
    if (batting && batting.length > 0) {
      const battingLogs = batting.map(player => ({
        game_id: game.id,
        player_name: player.name,
        ab: player.ab,
        r: player.r,
        h: player.h,
        doubles: player.doubles || 0,
        triples: player.triples || 0,
        hr: player.hr || 0,
        rbi: player.rbi || 0,
        bb: player.bb || 0,
        so: player.so || 0,
        sb: player.sb || 0
      }));
      
      await supabase.from('batting_log').insert(battingLogs);
    }
    
    // Insert pitching logs
    if (pitching && pitching.length > 0) {
      const pitchingLogs = pitching.map(pitcher => ({
        game_id: game.id,
        player_name: pitcher.name,
        ip: pitcher.ip,
        h: pitcher.h,
        r: pitcher.r,
        er: pitcher.er,
        bb: pitcher.bb,
        so: pitcher.so
      }));
      
      await supabase.from('pitching_log').insert(pitchingLogs);
    }
    
    res.json(game);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BRIEFING ENDPOINT ====================

app.get('/api/opponents/:opponentId/briefing', verifyAuth, async (req, res) => {
  try {
    // Get all games for opponent
    const { data: games } = await supabase
      .from('games')
      .select('id')
      .eq('opponent_id', req.params.opponentId);
    
    const gameIds = games?.map(g => g.id) || [];
    
    if (gameIds.length === 0) {
      return res.json({
        opponent_id: req.params.opponentId,
        games_count: 0,
        batting: [],
        pitching: [],
        game_plan: []
      });
    }
    
    // Aggregate batting stats
    const { data: battingData } = await supabase
      .from('batting_log')
      .select('*')
      .in('game_id', gameIds);
    
    const battingByPlayer = {};
    battingData?.forEach(log => {
      if (!battingByPlayer[log.player_name]) {
        battingByPlayer[log.player_name] = {
          name: log.player_name,
          ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
          rbi: 0, bb: 0, so: 0, sb: 0, games: 0
        };
      }
      const p = battingByPlayer[log.player_name];
      p.ab += log.ab || 0;
      p.r += log.r || 0;
      p.h += log.h || 0;
      p.doubles += log.doubles || 0;
      p.triples += log.triples || 0;
      p.hr += log.hr || 0;
      p.rbi += log.rbi || 0;
      p.bb += log.bb || 0;
      p.so += log.so || 0;
      p.sb += log.sb || 0;
      p.games += 1;
    });
    
    // Calculate AVG, OBP, K%
    const batting = Object.values(battingByPlayer).map(p => ({
      ...p,
      avg: p.ab > 0 ? (p.h / p.ab).toFixed(3) : '.000',
      obp: p.ab + p.bb > 0 ? ((p.h + p.bb) / (p.ab + p.bb)).toFixed(3) : '.000',
      k_pct: p.ab > 0 ? ((p.so / p.ab) * 100).toFixed(1) : '0.0',
      threat: p.avg > 0.400 ? true : false
    })).sort((a, b) => parseFloat(b.obp) - parseFloat(a.obp));
    
    // Aggregate pitching stats
    const { data: pitchingData } = await supabase
      .from('pitching_log')
      .select('*')
      .in('game_id', gameIds);
    
    const pitchingByPlayer = {};
    pitchingData?.forEach(log => {
      if (!pitchingByPlayer[log.player_name]) {
        pitchingByPlayer[log.player_name] = {
          name: log.player_name,
          ip: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, games: 0
        };
      }
      const p = pitchingByPlayer[log.player_name];
      p.ip += log.ip || 0;
      p.h += log.h || 0;
      p.r += log.r || 0;
      p.er += log.er || 0;
      p.bb += log.bb || 0;
      p.so += log.so || 0;
      p.games += 1;
    });
    
    // Calculate ERA, WHIP, K%
    const pitching = Object.values(pitchingByPlayer).map(p => ({
      ...p,
      era: p.ip > 0 ? ((p.er / p.ip) * 7).toFixed(2) : '0.00',
      whip: p.ip > 0 ? (((p.h + p.bb) / p.ip)).toFixed(2) : '0.00',
      k_pct: p.h + p.bb > 0 ? ((p.so / (p.h + p.bb)) * 100).toFixed(1) : '0.0'
    })).sort((a, b) => parseFloat(a.era) - parseFloat(b.era));
    
    // Generate game plan
    const topThreats = batting.filter(p => p.threat).slice(0, 3).map(p => p.name);
    const game_plan = [];
    
    if (topThreats.length > 0) {
      game_plan.push(`⚠️ Pitch around: ${topThreats.join(', ')}`);
    }
    
    const strikeouts = batting.filter(p => parseFloat(p.k_pct) > 30);
    if (strikeouts.length > 0) {
      game_plan.push(`🔴 Pitch to strikeout candidates: ${strikeouts.map(p => p.name).join(', ')}`);
    }
    
    game_plan.push('✓ Team contact-oriented (.460+ AVG) — force weak contact');
    game_plan.push('✓ Monitor pitching depth — exploit relief pitchers if available');
    
    res.json({
      opponent_id: req.params.opponentId,
      games_count: gameIds.length,
      last_updated: new Date().toISOString(),
      batting,
      pitching,
      game_plan
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== COACHES ENDPOINTS ====================

app.get('/api/workspaces/:workspaceId/coaches', verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('coaches')
      .select('*')
      .eq('workspace_id', req.params.workspaceId);
    
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workspaces/:workspaceId/coaches/invite', verifyAuth, async (req, res) => {
  try {
    const { email } = req.body;
    
    const { data, error } = await supabase
      .from('coach_invites')
      .insert({
        workspace_id: req.params.workspaceId,
        email,
        invited_by: req.userId,
        token: Math.random().toString(36).substring(7)
      })
      .select()
      .single();
    
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Invite sent', invite: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/workspaces/:workspaceId/coaches/:coachId', verifyAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('coaches')
      .delete()
      .eq('id', req.params.coachId);
    
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Coach removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOTES ENDPOINTS ====================

app.get('/api/games/:gameId/notes', verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('game_id', req.params.gameId);
    
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/:gameId/notes', verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notes')
      .insert({
        game_id: req.params.gameId,
        coach_id: req.userId,
        content: req.body.content,
        is_public: req.body.is_public || false
      })
      .select()
      .single();
    
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ==================== ERROR HANDLER ====================

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
