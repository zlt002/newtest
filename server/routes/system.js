import express from 'express';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

import { searchConversations } from '../projects.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  getLiteUpdateDistribution,
  getLiteUpdateStatus,
  launchLiteUpdater,
  prepareLiteUpdate,
} from '../windows-lite-update.js';

const router = express.Router();

export function resolveLiteAppDirFromRouteModuleUrl(routeModuleUrl = import.meta.url) {
  const routeDir = path.dirname(fileURLToPath(routeModuleUrl));
  return path.join(routeDir, '..', '..');
}

// Health check endpoint (no authentication required)
router.get('/health', (req, res) => {
  const distribution = getLiteUpdateDistribution();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    distribution: distribution.name
  });
});

// Lite update information endpoint
router.get('/api/system/update-info', authenticateToken, async (req, res) => {
  try {
    const appDir = resolveLiteAppDirFromRouteModuleUrl();
    const updateInfo = await getLiteUpdateStatus({ appDir });
    res.json(updateInfo);
  } catch (error) {
    console.error('Lite update info error:', error);
    res.status(500).json({
      updateAvailable: false,
      error: error.message,
    });
  }
});

// Lite online update endpoint
router.post('/api/system/update', authenticateToken, async (req, res) => {
  try {
    const appDir = resolveLiteAppDirFromRouteModuleUrl();
    const preparedUpdate = await prepareLiteUpdate({ appDir });

    res.json({
      success: true,
      message: 'Lite update package downloaded. The application will restart to apply the update.',
    });

    setTimeout(() => {
      launchLiteUpdater(preparedUpdate.updaterScriptPath);
    }, 500);
  } catch (error) {
    console.error('Lite update error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Audio transcription endpoint
router.post('/transcribe', authenticateToken, async (req, res) => {
  try {
    const multer = (await import('multer')).default;
    const upload = multer({ storage: multer.memoryStorage() });

    // Handle multipart form data
    upload.single('audio')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: 'Failed to process audio file' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server environment.' });
      }

      try {
        // Create form data for OpenAI
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype
        });
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'json');
        formData.append('language', 'en');

        // Make request to OpenAI
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...formData.getHeaders()
          },
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
        }

        const data = await response.json();
        let transcribedText = data.text || '';

        // Check if enhancement mode is enabled
        const mode = req.body.mode || 'default';

        // If no transcribed text, return empty
        if (!transcribedText) {
          return res.json({ text: '' });
        }

        // If default mode, return transcribed text without enhancement
        if (mode === 'default') {
          return res.json({ text: transcribedText });
        }

        // Handle different enhancement modes
        try {
          const OpenAI = (await import('openai')).default;
          const openai = new OpenAI({ apiKey });

          let prompt, systemMessage, temperature = 0.7, maxTokens = 800;

          switch (mode) {
            case 'prompt':
              systemMessage = 'You are an expert prompt engineer who creates clear, detailed, and effective prompts.';
              prompt = `You are an expert prompt engineer. Transform the following rough instruction into a clear, detailed, and context-aware AI prompt.

Your enhanced prompt should:
1. Be specific and unambiguous
2. Include relevant context and constraints
3. Specify the desired output format
4. Use clear, actionable language
5. Include examples where helpful
6. Consider edge cases and potential ambiguities

Transform this rough instruction into a well-crafted prompt:
"${transcribedText}"

Enhanced prompt:`;
              break;

            case 'vibe':
            case 'instructions':
            case 'architect':
              systemMessage = 'You are a helpful assistant that formats ideas into clear, actionable instructions for AI agents.';
              temperature = 0.5; // Lower temperature for more controlled output
              prompt = `Transform the following idea into clear, well-structured instructions that an AI agent can easily understand and execute.

IMPORTANT RULES:
- Format as clear, step-by-step instructions
- Add reasonable implementation details based on common patterns
- Only include details directly related to what was asked
- Do NOT add features or functionality not mentioned
- Keep the original intent and scope intact
- Use clear, actionable language an agent can follow

Transform this idea into agent-friendly instructions:
"${transcribedText}"

Agent instructions:`;
              break;

            default:
              // No enhancement needed
              break;
          }

          // Only make GPT call if we have a prompt
          if (prompt) {
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: prompt }
              ],
              temperature: temperature,
              max_tokens: maxTokens
            });

            transcribedText = completion.choices[0].message.content || transcribedText;
          }

        } catch (gptError) {
          console.error('GPT processing error:', gptError);
          // Fall back to original transcription if GPT fails
        }

        res.json({ text: transcribedText });

      } catch (error) {
        console.error('Transcription error:', error);
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    console.error('Endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search conversations content (SSE streaming)
router.get('/search/conversations', authenticateToken, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const parsedLimit = Number.parseInt(String(req.query.limit), 10);
  const limit = Number.isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 100));

  if (query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  const abortController = new AbortController();
  req.on('close', () => { closed = true; abortController.abort(); });

  try {
    await searchConversations(query, limit, ({ projectResult, totalMatches, scannedProjects, totalProjects }) => {
      if (closed) return;
      if (projectResult) {
        res.write(`event: result\ndata: ${JSON.stringify({ projectResult, totalMatches, scannedProjects, totalProjects })}\n\n`);
      } else {
        res.write(`event: progress\ndata: ${JSON.stringify({ totalMatches, scannedProjects, totalProjects })}\n\n`);
      }
    }, abortController.signal);
    if (!closed) {
      res.write(`event: done\ndata: {}\n\n`);
    }
  } catch (error) {
    console.error('Error searching conversations:', error);
    if (!closed) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Search failed' })}\n\n`);
    }
  } finally {
    if (!closed) {
      res.end();
    }
  }
});

export default router;
