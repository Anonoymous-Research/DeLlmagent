import React, { useEffect, useState } from 'react';

function App() {
  // 输入框里的任务描述
  const [description, setDescription] = useState('');

  // 用于显示任务创建的结果
  const [createTaskResult, setCreateTaskResult] = useState('');
  const [taskStatus, setTaskStatus] = useState('');  // 用于任务状态的提示词

  // 任务列表
  const [tasks, setTasks] = useState([]);

  // 任务列表展开控制
  const [openTasks, setOpenTasks] = useState({});

  // 任务加载状态
  const [loading, setLoading] = useState(false); // 任务加载状态
  const [currentTaskId, setCurrentTaskId] = useState(null); // 当前任务 ID

  // -------------------------------------------------------
  // 1. 创建任务
  // -------------------------------------------------------
  const handleCreateTask = async () => {
    setTaskStatus('任务创建成功，正在执行中...'); // 更新状态为创建成功并正在执行
    setLoading(true); // 开始加载
    try {
      const response = await fetch('http://localhost:4000/createTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await response.json();
      if (data.success) {
        setCreateTaskResult(`任务创建成功，ID: ${data.taskId}，IPFS 哈希: ${data.ipfsHash}`);
        setTaskStatus('任务执行中...'); // 更新状态为正在执行
        setCurrentTaskId(data.taskId); // 设置当前任务 ID
        // 重新加载任务列表
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

  // -------------------------------------------------------
  // 2. 获取任务列表
  // -------------------------------------------------------
  const fetchTasks = async () => {
    try {
      const response = await fetch('http://localhost:4000/getTasks');
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks);
        setTaskStatus('任务执行完毕！'); // 更新状态为任务完成
        setLoading(false); // 加载完成，设置为 false
      } else {
        console.error('获取任务失败: ', data.error);
        setTaskStatus('获取任务失败');
      }
    } catch (err) {
      console.error('获取任务异常: ', err);
      setTaskStatus('获取任务异常');
      setLoading(false); // 加载失败，设置为 false
    }
  };

  // -------------------------------------------------------
  // 3. 启动轮询，定期获取任务状态
  // -------------------------------------------------------
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchTasks();
    }, 5000); // 每5秒钟检查一次任务状态

    return () => clearInterval(intervalId);
  }, []);

  // 控制任务详情显示与隐藏
  const toggleTaskDetails = (taskId) => {
    setOpenTasks((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],  // Toggle visibility for this task
    }));
  };

  // 显示对话进度
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

  // 处理并交替展示每一轮对话
  const generateDialog = (agentAConversation, agentBConversation) => {
    // 将对话按 "Agent A:" 和 "Agent B:" 进行分割
    const agentA = agentAConversation.split("Agent A:").filter((e) => e.trim() !== "");
    const agentB = agentBConversation.split("Agent B:").filter((e) => e.trim() !== "");

    const dialog = [];
    const length = Math.max(agentA.length, agentB.length);

    // 交替显示每一轮的对话
    for (let i = 0; i < length; i++) {
      if (i < agentA.length) {
        dialog.push(<div style={styles.agentA}>{`Agent A: ${agentA[i].trim()}`}</div>);
      }
      if (i < agentB.length) {
        dialog.push(<div style={styles.agentB}>{`Agent B: ${agentB[i].trim()}`}</div>);
      }
    }
    return dialog;
  };

  return (
    <div style={styles.container}>
      <h1>多智能体任务系统</h1>
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
                <span>{`任务 ID: ${task.id} - ${task.description}\n`}</span>
                <span>{`IPFS Hash: ${task.ipfsHash}\n`}</span>
                <span>{`${task.agentAConversation}`}</span>
                <button
                  onClick={() => toggleTaskDetails(task.id)}
                  style={styles.toggleButton}
                >
                  {openTasks[task.id] ? '隐藏详情' : '查看详情'}
                </button>
              </div>

              {openTasks[task.id] && (
                <div style={styles.taskDetails}>
                  {showProgress(task.id)} {/* 展示加载进度 */}
                  <div style={styles.dialogContainer}>
                    {generateDialog(task.agentAConversation, task.agentBConversation)}
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

// 一些简单的内联样式
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
  taskItem: {
    marginBottom: '15px',
    padding: '15px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
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
  },
  agentA: {
    backgroundColor: '#e3f2fd',
    padding: '10px',
    borderRadius: '8px',
    marginBottom: '5px',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
  },
  agentB: {
    backgroundColor: '#f1f8e9',
    padding: '10px',
    borderRadius: '8px',
    marginBottom: '5px',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
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
};

// CSS 动画
const stylesKeyframes = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

export default App;