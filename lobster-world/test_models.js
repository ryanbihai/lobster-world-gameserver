const models = [
  'MiniMax-Text-01',
  'abab6.5-chat',
  'abab6.5s-chat',
  'MiniMax-M2.5',
  'MiniMax-M2.7',
  'MiniMax-M2.7-highspeed',
  'MiniMax-M2.5-highspeed',
  'minimax-m2.5-highspeed',
  'minimax-m2.7-highspeed',
  'minimax-text-01',
  'minimax-text-01',
  'minimax-text-01',
  'abab5.5-chat',
  'abab5.5s-chat',
  'MiniMax-Text-01',
  'MiniMax-Text-01'
];

const apiKey = 'sk-cp-XPrqyNb5HzWsEJEmTrsYIF-IiSnXx6DToryduZsXyudWkHbEbaf3iB8tD0L3J_bLkx04kjbebbP2XzhXgfPZWF4m5n8DUSYRVpP8Q8ZucgI6FmDarfEtcrA';
const baseURL = 'https://api.minimax.chat/v1';

async function testModel(model) {
  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'hello' }]
      })
    });
    const text = await response.text();
    if (response.ok) {
      console.log(`✅ Success with model: ${model}`);
      return true;
    } else {
      console.log(`❌ Failed with model: ${model} - ${text}`);
      return false;
    }
  } catch (err) {
    console.log(`❌ Error with model: ${model} - ${err.message}`);
    return false;
  }
}

async function run() {
  for (const m of models) {
    const success = await testModel(m);
    if (success) break;
  }
}

run();