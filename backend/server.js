import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 5000;

// Enable CORS so our React frontend (running on a different port) can talk to this backend
app.use(cors());
app.use(express.json());

// Test route to ensure the backend is working
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend server is running smoothly!' });
});

// Main Route: Receives transcript from frontend and forwards it to local Ollama instance
app.post('/api/analyze', async (req, res) => {
  const { transcript } = req.body;

  if (!transcript) {
    return res.status(400).json({ error: 'No transcript provided.' });
  }

  // System instructions + rubric mapping context for Ollama
  const systemPrompt = `
You are Trinethra AI, an expert organizational psychology assistant for DeepThought. 
Analyze the supervisor transcript provided below. 

You MUST return your response as a single, valid JSON object wrapped inside a \`\`\`json \`\`\` code block. Do not include any conversational text outside the code block.

Expected JSON Structure:
{
  "extractedEvidence": [
    { "quote": "verbatim text from transcript", "sentiment": "Positive/Negative/Neutral" }
  ],
  "rubricEvaluation": {
    "suggestedScore": 7,
    "justification": "One paragraph objective justification summarizing performance based on quotes."
  },
  "kpiMapping": ["List any of the relevant 8 manufacturing KPIs mentioned"],
  "gapAnalysis": ["List what was NOT covered or discussed in the transcript regarding operations"],
  "suggestedFollowUp": ["3 to 5 highly targeted questions for the next supervisor call to fill the gaps"]
}

Transcript:
"${transcript}"
`;

  try {
    // Calling local Ollama instance running on port 11434
    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: systemPrompt,
        stream: false
      })
    });

    const data = await ollamaResponse.json();
    const rawText = data.response;

    // A robust regex utility to safely isolate and extract the JSON object out of the LLM response
    const jsonRegex = /```json\s([\s\S]*?)\s```/;
    const match = rawText.match(jsonRegex);
    const cleanJsonString = match ? match[1] : rawText;

    const parsedAnalysis = JSON.parse(cleanJsonString.trim());
    
    // Return the clean structural data back to the frontend
    res.json(parsedAnalysis);

  } catch (error) {
    console.error("Backend processing error:", error);
    res.status(500).json({ 
      error: 'Failed to process transcript analysis.', 
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Trinethra Backend Server running on http://localhost:${PORT}`);
});