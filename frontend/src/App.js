import React, { useEffect, useState } from 'react';

const fetchFromIPFS = async (ipfsHash) => {
  // const ipfsUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
  const ipfsUrl = `http://localhost:8081/ipfs/${ipfsHash}`;
  try {
    const response = await fetch(ipfsUrl);
    if (!response.ok) {
      console.error(`Failed to fetch from IPFS: ${response.statusText}`);
      throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
    }
    const data = await response.text();
    console.log("Fetched data from IPFS:", data);
    return data;
  } catch (error) {
    console.error("Error fetching from IPFS:", error);
    return null;
  }
};

function App() {
  // 任务描述输入框
  const [description, setDescription] = useState('');
  // 显示任务创建结果
  const [createTaskResult, setCreateTaskResult] = useState('');
  // 显示任务状态
  const [taskStatus, setTaskStatus] = useState('');
  // 存储任务列表（从后端获取）
  const [tasks, setTasks] = useState([]);
  // 控制每个任务详情是否展开
  const [openTasks, setOpenTasks] = useState({});
  // 当前任务加载状态（用于显示加载动画）
  const [loading, setLoading] = useState(false);
  // 当前任务 ID
  const [currentTaskId, setCurrentTaskId] = useState(null);
  // 存储从 IPFS 获取的任务对话内容，键为任务 ID
  const [taskDetailsMap, setTaskDetailsMap] = useState({});

  // 创建任务
  const handleCreateTask = async () => {
    setTaskStatus('任务创建成功，正在执行中...');
    setLoading(true);
    try {
      const response = await fetch('http://localhost:4000/createTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await response.json();
      if (data.success) {
        setCreateTaskResult(`任务创建成功，ID: ${data.taskId}，IPFS 哈希: ${data.ipfsHash}`);
        setTaskStatus('任务执行中...');
        setCurrentTaskId(data.taskId);
        fetchTasks();
      } else {
        setCreateTaskResult('任务创建失败: ' + data.error);
        setTaskStatus('任务创建失败');
      }
    } catch (err) {
      console.error(err);
      setCreateTaskResult('任务创建失败: ' + err.toString());
      setTaskStatus('任务创建失败');
    }
  };

  // 获取任务列表
  const fetchTasks = async () => {
    try {
      const response = await fetch('http://localhost:4000/getTasks');
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks);
        setTaskStatus('任务执行完毕！');
        setLoading(false);
      } else {
        console.error('获取任务失败: ', data.error);
        setTaskStatus('获取任务失败');
      }
    } catch (err) {
      console.error('获取任务异常: ', err);
      setTaskStatus('获取任务异常');
      setLoading(false);
    }
  };

  // 每 5 秒轮询任务列表
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchTasks();
    }, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // 切换任务详情展开状态，同时如果展开且未加载过 IPFS 数据，则加载对话内容
  const toggleTaskDetails = (taskId, ipfsHash) => {
    setOpenTasks((prev) => {
      const newState = { ...prev, [taskId]: !prev[taskId] };
      if (newState[taskId] && !taskDetailsMap[taskId]) {
        fetchFromIPFS(ipfsHash).then((details) => {
          setTaskDetailsMap((prevMap) => ({ ...prevMap, [taskId]: details }));
        });
      }
      return newState;
    });
  };

  // 显示加载动画
  const showProgress = (taskId) => {
    if (loading && currentTaskId === taskId) {
      return (
        <div style={styles.loadingContainer}>
          <div style={styles.loadingCircle}></div> 正在生成对话...
        </div>
      );
    }
    return null;
  };

  // 处理并交替展示对话内容
  const generateDialog = (taskDetails) => {
    if (!taskDetails) {
      return <div>对话内容加载失败</div>;
    }
  
    // 1. 提取 Agent A 的每一轮对话内容
    // split("Agent A:") 会返回一个数组，第一项通常为空（如果文本以 "Agent A:" 开头）
    const agentARounds = taskDetails
      .split("Agent A:")
      .slice(1) // 去掉第一个空白部分
      .map(item => {
        // 每个元素可能包含 Agent A 后面到下一个 "Agent B:" 之间的文本
        return item.split("Agent B:")[0].trim();
      });
  
    // 2. 提取 Agent B 的每一轮对话内容
    const agentBRounds = taskDetails
      .split("Agent B:")
      .slice(1)
      .map(item => {
        return item.split("Agent A:")[0].trim();
      });
  
    // 3. 根据两组数组生成交替显示的对话轮次
    const rounds = [];
    const roundCount = Math.max(agentARounds.length, agentBRounds.length);
    for (let i = 0; i < roundCount; i++) {
      rounds.push(
        <div key={`round-${i}`} style={styles.dialog}>
          {agentARounds[i] && (
            <div style={styles.agentA}>
              <strong>Agent A:</strong>
              <pre style={styles.pre}>{agentARounds[i]}</pre>
            </div>
          )}
          {agentBRounds[i] && (
            <div style={styles.agentB}>
              <strong>Agent B:</strong>
              <pre style={styles.pre}>{agentBRounds[i]}</pre>
            </div>
          )}
        </div>
      );
    }
  
    return rounds;
  };

  return (
    <div style={styles.container}>
      <h1>去中心化的多智能体任务系统</h1>
      <div style={styles.formContainer}>
        <h2>创建新任务</h2>
        <input
          style={styles.input}
          type="text"
          placeholder="任务描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button style={styles.button} onClick={handleCreateTask}>
          发布任务
        </button>
        <div style={styles.result}>{createTaskResult}</div>
      </div>

      <div style={styles.taskContainer}>
        <h2>任务列表</h2>
        {taskStatus && <p>{taskStatus}</p>}
        {tasks.length === 0 ? (
          <p>暂无任务</p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              style={task.completed ? styles.completedTask : styles.failedTask}
            >
              <div style={styles.taskHeader}>
                <span>{`任务 ID: ${task.id} - ${task.description}`}</span>
                <span>{`IPFS Hash: ${task.ipfsHash}`}</span>
                <button
                  onClick={() => toggleTaskDetails(task.id, task.ipfsHash)}
                  style={styles.toggleButton}
                >
                  {openTasks[task.id] ? '隐藏详情' : '查看详情'}
                </button>
              </div>

              {openTasks[task.id] && (
                <div style={styles.taskDetails}>
                  {showProgress(task.id)}
                  <div style={styles.dialogContainer}>
                    {generateDialog(taskDetailsMap[task.id])}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// 更新后的样式
const styles = {
  container: {
    padding: '20px',
    fontFamily: 'Helvetica, Arial, sans-serif',
    maxWidth: '900px',
    margin: '0 auto',
    backgroundColor: '#f4f7fc',
    borderRadius: '8px',
  },
  formContainer: {
    backgroundColor: '#ffffff',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    marginBottom: '20px',
  },
  input: {
    padding: '10px',
    fontSize: '16px',
    borderRadius: '4px',
    width: '80%',
    border: '1px solid #ddd',
    marginRight: '10px',
  },
  button: {
    padding: '10px 15px',
    fontSize: '16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  result: {
    marginTop: '10px',
    fontSize: '14px',
    color: '#555',
  },
  taskContainer: {
    marginTop: '30px',
  },
  completedTask: {
    marginBottom: '15px',
    padding: '15px',
    backgroundColor: '#e8f5e9', // Green background for completed tasks
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
  },
  failedTask: {
    marginBottom: '15px',
    padding: '15px',
    backgroundColor: '#ffebee', // Red background for failed tasks
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
  },
  taskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleButton: {
    padding: '8px 12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  taskDetails: {
    marginTop: '10px',
    padding: '10px',
    borderTop: '1px solid #ddd',
    backgroundColor: '#f9f9f9',
  },
  dialogContainer: {
    padding: '10px',
    marginTop: '10px',
    wordWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  dialog: {
    marginBottom: '15px',
    padding: '10px',
  },
  agentA: {
    backgroundColor: '#e3f2fd',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '10px',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    maxWidth: '100%',
    wordBreak: 'break-word',
  },
  agentB: {
    backgroundColor: '#f1f8e9',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '10px',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    maxWidth: '100%',
    wordBreak: 'break-word',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '10px',
  },
  loadingCircle: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: '4px solid #007bff',
    borderTop: '4px solid transparent',
    animation: 'spin 1s linear infinite',
    margin: '0 auto',
  },
  pre: {
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  },
};

export default App;