import requests
from cryptography.fernet import Fernet

# 生成对称加密密钥 (实际项目中需妥善管理，不能随意重新生成)
key = Fernet.generate_key()
cipher = Fernet(key)

def encrypt_message(message: str) -> bytes:
    """使用对称加密对消息进行加密"""
    return cipher.encrypt(message.encode())

def decrypt_message(token: bytes) -> str:
    """解密"""
    return cipher.decrypt(token).decode()

def simulate_agents(task_id: int):
    """
    模拟多个智能体处理同一个任务，将处理日志加密后合并上传
    在真实环境中，这里会调用LLM/API来生成沟通内容
    """
    # 假设有3个智能体产生3条日志
    agents = ["AgentA", "AgentB", "AgentC"]
    encrypted_logs = []
    for agent in agents:
        original_log = f"{agent} 正在处理任务ID: {task_id}"
        enc_log = encrypt_message(original_log)
        # 为了在JSON中传输，把二进制先decode成base64/utf-8字符串
        encrypted_logs.append(enc_log.decode('utf-8'))

    # 合并成一个字符串，或者你也可以json化
    final_logs_str = "\n".join(encrypted_logs)

    # 请求后端：将final_logs_str上传IPFS并调用completeTask
    resp = requests.post("http://localhost:3000/complete", json={
        "taskId": task_id,
        "logData": final_logs_str
    })
    print("完成任务返回：", resp.json())

def main():
    # 1. 用户先发布任务
    description = "测试多智能体任务"
    create_resp = requests.post("http://localhost:3000/task", json={"description": description})
    data = create_resp.json()
    if data["success"]:
        task_id = data["taskId"]
        print("任务创建成功：", task_id)

        # 2. 智能体开始模拟处理
        simulate_agents(task_id)
    else:
        print("任务创建失败：", data)

if __name__ == "__main__":
    main()