import express from 'express';
import bodyParser from 'body-parser';
import Web3 from 'web3';
import OpenAI from 'openai';
import { create as createIpfs } from 'ipfs-http-client';
import contractArtifact from './build/contracts/TaskManager.json' assert { type: 'json' };
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

// 如果使用本地 IPFS 节点，可能地址是 localhost:5001
// 你也可以使用 infura 或其他公共 IPFS 网关
const ipfs = createIpfs({ host: 'localhost', port: '5001', protocol: 'http' });

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Initialize OpenAI API with the correct approach for version 4.x or later
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Use your OpenAI API key
  apiBase: 'https://api.openai.com/v1', // Specify the API base URL
});

// 连接本地 Ganache
const web3 = new Web3("http://127.0.0.1:8545");

// 替换为你实际部署的合约地址
const contractAddress = process.env.CONTRACT_ADDRESS;

// 使用合约 ABI 和地址实例化合约对象
const taskManager = new web3.eth.Contract(contractArtifact.abi, contractAddress);

const agentsInteraction = async (taskDescription) => {
  // 用于存储完整的多轮对话
  let fullAgentAConversation = "";
  let fullAgentBConversation = "";

  // 设置初始消息
  let agentAMessages = [
    { role: 'system', content: 'You are Agent A, a task analyst. Break down the task into sub-tasks and think step by step.' },
    { role: 'user', content: taskDescription }
  ];

  let agentBMessages = [
    { role: 'system', content: 'You are Agent B, an executor. You will execute the sub-tasks provided by Agent A step by step.' }
  ];

  let agentAResult = '';
  let agentBResult = '';
  let conversationComplete = false;
  let rounds = 0;

  // Continue the conversation until the task is completed or we hit a round limit
  while (!conversationComplete && rounds < 3) {  // Limiting to 10 rounds to prevent infinite loops
    // Agent A provides a breakdown of the task
    const agentAResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: agentAMessages
    });

    agentAResult = agentAResponse.choices[0].message.content;
    fullAgentAConversation += `\nAgent A: ${agentAResult}`;  // Accumulate Agent A's responses

    agentAMessages.push({ role: 'assistant', content: agentAResult });  // Save Agent A's response for context

    // Agent B handles the execution of the sub-task
    const agentBMessagesWithContext = [...agentBMessages, { role: 'assistant', content: agentAResult }];
    const agentBResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: agentBMessagesWithContext
    });

    agentBResult = agentBResponse.choices[0].message.content;
    fullAgentBConversation += `\nAgent B: ${agentBResult}`;  // Accumulate Agent B's responses

    agentBMessages.push({ role: 'assistant', content: agentBResult });  // Save Agent B's response for context

    // Check if the task is complete (You can implement a logic here to determine when the task is finished)
    if (agentBResult.includes("task complete") || agentAResult.includes("task complete")) {
      conversationComplete = true;
    }

    rounds++;  // Increment round counter to prevent infinite loops
  }

  // Return the complete conversations for both agents
  return {
    agentAConversation: fullAgentAConversation,
    agentBConversation: fullAgentBConversation
  };
};

// --------------------------------------------
// 1. 发布任务接口: /task
// --------------------------------------------
// Route to create task and trigger multi-agent interaction
// Route: /createTask
// Route: /createTask (Automatic Task Completion)
app.post('/createTask', async (req, res) => {
  const { description } = req.body;
  try {
    // Get the first account from Ganache
    const accounts = await web3.eth.getAccounts();

    // Step 1: Create the task on the blockchain
    const tx = await taskManager.methods
      .createTask(description)
      .send({ from: accounts[0], gas: 3000000, maxFeePerGas: '20000000000', maxPriorityFeePerGas: '2000000000' });

    const taskId = tx.events.TaskCreated.returnValues.id.toString();

    // Step 2: Trigger multi-agent interaction to handle task completion
    const interactionResults = await agentsInteraction(description);

    // Combine Agent A and Agent B's output into one string
    const combinedLogs = `Agent A: ${interactionResults.agentAConversation}\n\nAgent B: ${interactionResults.agentBConversation}`;

    // Step 3: Upload combined logs to IPFS
    const { cid } = await ipfs.add(combinedLogs);
    const ipfsHash = cid.toString();

    // Step 4: Complete the task and store IPFS hash on blockchain
    await taskManager.methods
      .completeTask(taskId, ipfsHash, interactionResults.agentAConversation, interactionResults.agentBConversation)
      .send({ from: accounts[0], gas: 3000000, maxFeePerGas: '20000000000', maxPriorityFeePerGas: '2000000000' });

    // Return response to front-end
    res.json({
      success: true,
      taskId,
      ipfsHash,
      agentAConversation: interactionResults.agentAConversation,
      agentBConversation: interactionResults.agentBConversation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});



// --------------------------------------------
// 2. 完成任务接口: /completeTask
// --------------------------------------------
// Route: /completeTask
app.post('/completeTask', async (req, res) => {
  const { taskId, description } = req.body; // TaskId and description
  try {
    // Trigger multi-agent interaction
    const interactionResults = await agentsInteraction(description);

    // Combine Agent A and Agent B's output into one string
    const combinedLogs = `Agent A: ${interactionResults.agentAConversation}\n\nAgent B: ${interactionResults.agentBConversation}`;

    // Upload combined logs to IPFS
    const { cid } = await ipfs.add(combinedLogs);
    const ipfsHash = cid.toString();

    // Get accounts for signing the transaction
    const accounts = await web3.eth.getAccounts();

    // Complete the task and store IPFS hash
    await taskManager.methods
      .completeTask(taskId, ipfsHash, interactionResults.agentAConversation, interactionResults.agentBConversation)
      .send({ from: accounts[0], gas: 3000000, maxFeePerGas: '20000000000', maxPriorityFeePerGas: '2000000000' });

    res.json({
      success: true,
      ipfsHash,
      agentAConversation: interactionResults.agentAConversation,
      agentBConversation: interactionResults.agentBConversation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// --------------------------------------------
// 3. 查询所有任务接口: /tasks
// --------------------------------------------
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
        ipfsHash: task[4],
        agentAConversation: task[5], // 确保在任务完成时保存 Agent A 和 Agent B 的对话结果
        agentBConversation: task[6]  // 假设你将这些结果存储在智能合约中
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