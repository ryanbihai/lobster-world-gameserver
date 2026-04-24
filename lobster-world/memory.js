const fs = require('fs');
const path = require('path');

class MemoryManager {
  constructor() {
    this.memoryDir = path.join(__dirname, 'memory');
    this.shortMemoryFile = path.join(this.memoryDir, 'memory_short.md');
    this.longMemoryFile = path.join(this.memoryDir, 'memory_long.md');
    this.journalFile = path.join(this.memoryDir, 'journal.md');
    this.soulFile = path.join(__dirname, 'SOUL.md');
    this.baseFile = path.join(__dirname, 'BASE.md');
    
    this.ensureMemoryDir();
  }

  ensureMemoryDir() {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  appendShortMemory(content) {
    try {
      const timestamp = new Date().toISOString();
      const entry = `\n### [${timestamp}]\n${content}\n`;
      
      if (fs.existsSync(this.shortMemoryFile)) {
        fs.appendFileSync(this.shortMemoryFile, entry, 'utf-8');
      } else {
        const header = '# 短期记忆 (Memory Short)\n\n## 今日流水账\n';
        fs.writeFileSync(this.shortMemoryFile, header + entry, 'utf-8');
      }
      
      return { success: true, timestamp };
    } catch (error) {
      console.error('[Memory] 写入短期记忆失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  clearShortMemory() {
    try {
      const header = '# 短期记忆 (Memory Short)\n\n## 今日流水账\n\n';
      fs.writeFileSync(this.shortMemoryFile, header, 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('[Memory] 清空短期记忆失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  readShortMemory() {
    try {
      if (!fs.existsSync(this.shortMemoryFile)) {
        return '';
      }
      return fs.readFileSync(this.shortMemoryFile, 'utf-8');
    } catch (error) {
      console.error('[Memory] 读取短期记忆失败:', error.message);
      return '';
    }
  }

  appendLongMemory(content) {
    try {
      const timestamp = new Date().toISOString();
      const entry = `\n### [${timestamp}]\n${content}\n`;
      
      if (fs.existsSync(this.longMemoryFile)) {
        fs.appendFileSync(this.longMemoryFile, entry, 'utf-8');
      } else {
        const header = '# 长期记忆 (Memory Long)\n\n## 重要记录\n';
        fs.writeFileSync(this.longMemoryFile, header + entry, 'utf-8');
      }
      
      return { success: true, timestamp };
    } catch (error) {
      console.error('[Memory] 写入长期记忆失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  readLongMemory() {
    try {
      if (!fs.existsSync(this.longMemoryFile)) {
        return '';
      }
      return fs.readFileSync(this.longMemoryFile, 'utf-8');
    } catch (error) {
      console.error('[Memory] 读取长期记忆失败:', error.message);
      return '';
    }
  }

  appendJournal(entry) {
    try {
      const timestamp = new Date().toISOString();
      const date = new Date().toISOString().split('T')[0];
      const time = timestamp.split('T')[1].split('.')[0];
      
      const journalEntry = `## ${date}\n\n### ${time}\n${entry}\n\n`;
      
      if (fs.existsSync(this.journalFile)) {
        const content = fs.readFileSync(this.journalFile, 'utf-8');
        const lines = content.split('\n');
        
        let insertIndex = lines.length;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('## ')) {
            const existingDate = lines[i].substring(3).trim();
            if (existingDate === date) {
              insertIndex = i + 1;
              while (insertIndex < lines.length && !lines[insertIndex].startsWith('## ')) {
                insertIndex++;
              }
              break;
            }
          }
        }
        
        lines.splice(insertIndex, 0, journalEntry);
        fs.writeFileSync(this.journalFile, lines.join('\n'), 'utf-8');
      } else {
        const header = '# OpenClaw 日记\n\n';
        fs.writeFileSync(this.journalFile, header + journalEntry, 'utf-8');
      }
      
      return { success: true, timestamp, date };
    } catch (error) {
      console.error('[Memory] 写入日记失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  readJournal() {
    try {
      if (!fs.existsSync(this.journalFile)) {
        return '';
      }
      return fs.readFileSync(this.journalFile, 'utf-8');
    } catch (error) {
      console.error('[Memory] 读取日记失败:', error.message);
      return '';
    }
  }

  readSoul() {
    try {
      if (!fs.existsSync(this.soulFile)) {
        return '';
      }
      return fs.readFileSync(this.soulFile, 'utf-8');
    } catch (error) {
      console.error('[Memory] 读取灵魂文件失败:', error.message);
      return '';
    }
  }

  writeSoul(content) {
    try {
      fs.writeFileSync(this.soulFile, content, 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('[Memory] 写入灵魂文件失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  readBase() {
    try {
      if (!fs.existsSync(this.baseFile)) {
        return '';
      }
      return fs.readFileSync(this.baseFile, 'utf-8');
    } catch (error) {
      console.error('[Memory] 读取基础文件失败:', error.message);
      return '';
    }
  }
}

const memoryManager = new MemoryManager();

function appendShortMemory(content) {
  return memoryManager.appendShortMemory(content);
}

function clearShortMemory() {
  return memoryManager.clearShortMemory();
}

function readShortMemory() {
  return memoryManager.readShortMemory();
}

function appendLongMemory(content) {
  return memoryManager.appendLongMemory(content);
}

function readLongMemory() {
  return memoryManager.readLongMemory();
}

function appendJournal(entry) {
  return memoryManager.appendJournal(entry);
}

function readJournal() {
  return memoryManager.readJournal();
}

function readSoul() {
  return memoryManager.readSoul();
}

function writeSoul(content) {
  return memoryManager.writeSoul(content);
}

function readBase() {
  return memoryManager.readBase();
}

function ensureMemoryDir() {
  return memoryManager.ensureMemoryDir();
}

module.exports = {
  appendShortMemory,
  clearShortMemory,
  readShortMemory,
  appendLongMemory,
  readLongMemory,
  appendJournal,
  readJournal,
  readSoul,
  writeSoul,
  readBase,
  ensureMemoryDir,
  MemoryManager
};
