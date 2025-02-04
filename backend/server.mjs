import express from 'express';
import bodyParser from 'body-parser';
import Web3 from 'web3';
import OpenAI from 'openai';
import { create as createIpfs } from 'ipfs-http-client';
import contractArtifact from './build/contracts/TaskManager.json' assert { type: 'json' };
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config(); // 加载环境变量

// 初始化 IPFS 客户端
const ipfs = createIpfs({ host: 'localhost', port: '5001', protocol: 'http' });

const app = express();
app.use(bodyParser.json());
app.use(cors());

// 初始化 OpenAI API（Agent A 与 Agent B 均使用 OpenAI 模型示例）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  apiBase: 'https://api.openai.com/v1',
});

// 初始化 Web3 与合约
const web3 = new Web3("http://127.0.0.1:8545");
const contractAddress = process.env.CONTRACT_ADDRESS;
const taskManager = new web3.eth.Contract(contractArtifact.abi, contractAddress);

// 存储任务状态（仅用于演示，实际部署建议使用数据库）
let taskStates = {};

/**
 * Agent A: 规划任务和评估 Agent B 的结果
 * @param {string} taskDescription - 任务描述
 * @param {Array<string>} previousConversations - 历史上下文（仅为纯文本，不含前缀）
 * @returns {Promise<string>} - Agent A 的输出
 */
const planAndEvaluateTask = async (taskDescription, previousConversations) => {
  const prompt = `
    You are a task planner, and also need to evaluate other's result to see satisfying the task description.
    First of all, exactly tell the task description: "${taskDescription}", and then break it down into specific steps and give detailed instructions for others to execute. 
    Then waiting for others to execute the task. Once you received their outputs, you can evaluate. If not satisfying, give more suggestions. If satisfying, output 'TASK COMPLETE'.
  `;
  
  // 使用历史对话作为上下文
  const context = previousConversations.map(conv => ({ role: 'user', content: conv }));
  const messages = [{ role: 'system', content: prompt }, ...context];

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages
  });

  return response.choices[0].message.content;  // 返回最新的 Agent A 输出
};

// Agent B: 执行任务并返回执行结果
const executeTaskForAgentB = async (taskDescription, previousConversations) => {
  const prompt = `
    You are the task executor.
    Based on the task description and instruction, following the instruction and output the expected result.
  `;
  
  // 使用历史对话作为上下文
  const context = previousConversations.map(conv => ({ role: 'user', content: conv }));
  const messages = [...context, { role: 'system', content: prompt }];

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages
  });

  return response.choices[0].message.content;  // 返回 Agent B 的执行结果
};


// Route: 创建任务
app.post('/createTask', async (req, res) => {
  const { description } = req.body;
  try {
    const accounts = await web3.eth.getAccounts();

    // 在区块链上创建任务
    const tx = await taskManager.methods
      .createTask(description)
      .send({ from: accounts[0], gas: 3000000, maxFeePerGas: '20000000000', maxPriorityFeePerGas: '2000000000' });

    const taskId = tx.events.TaskCreated.returnValues.id.toString();

    // 初始化对话记录和上下文
    let fullAgentAConversation = "";
    let fullAgentBConversation = "";
    let contextMessages = [];
    let rounds = 0;
    let conversationComplete = false;
    let agentAResult, agentBResult;

    // 多轮对话，最多 3 轮
    while (!conversationComplete && rounds < 3) {
      // Agent A 规划任务并评估
      agentAResult = await planAndEvaluateTask(description, contextMessages);
      // console.log(`\nAgent A: ${agentAResult}`);
      fullAgentAConversation += `\n\nAgent A: ${agentAResult}`;
      contextMessages.push(agentAResult);  // 更新历史上下文

      // 检查任务是否完成（可以根据具体的标准判断）
      if (agentAResult.includes("TASK COMPLETE")) {
        conversationComplete = true;
        break;
      }

      // Agent B 执行任务
      agentBResult = await executeTaskForAgentB(description, contextMessages);
      // console.log(`\nAgent B: ${agentBResult}`);
      fullAgentBConversation += `\n\nAgent B: ${agentBResult}`;
      contextMessages.push(agentBResult);  // 更新历史上下文

      rounds++;
    }

    // 拼接最终对话日志
    const combinedLogs = `${fullAgentAConversation}\n\n${fullAgentBConversation}`;
    
    // 上传对话内容到 IPFS
    const { cid } = await ipfs.add(combinedLogs);
    const ipfsHash = cid.toString();

    // 完成任务并将 IPFS 哈希存储到区块链
    await taskManager.methods
      .completeTask(taskId, ipfsHash)
      .send({ from: accounts[0], gas: 3000000, maxFeePerGas: '20000000000', maxPriorityFeePerGas: '2000000000' });

    console.log('============================================================');
    console.log(combinedLogs);
    console.log('============================================================');
    // 返回成功响应
    res.json({
      success: true,
      taskId,
      ipfsHash,
      agentAConversation: fullAgentAConversation,
      agentBConversation: fullAgentBConversation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// Route: 获取所有任务（只返回 IPFS 哈希等基本信息）
app.get('/getTasks', async (req, res) => {
  try {
    const accounts = await web3.eth.getAccounts();
    const count = await taskManager.methods.taskCount().call();

    let tasks = [];
    for (let i = 1; i <= count; i++) {
      const task = await taskManager.methods.getTask(i).call({ from: accounts[0] });
      tasks.push({
        id: String(task[0]),
        creator: task[1],
        description: task[2],
        completed: task[3],
        ipfsHash: task[4],  // 合约中只存储 IPFS 哈希
      });
    }

    res.json({ success: true, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// 启动服务器
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});