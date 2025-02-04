pragma solidity ^0.8.0;

contract TaskManager {
    uint public taskCount = 0;
    mapping(uint => Task) public tasks;

    struct Task {
        uint id;
        address creator;
        string description;
        bool completed;
        string ipfsHash; // 保存任务完成的日志 IPFS 哈希
    }

    event TaskCreated(uint id, address creator, string description);
    event TaskCompleted(uint id, string ipfsHash);

    // 创建任务
    function createTask(string memory _description) public {
        taskCount++;
        tasks[taskCount] = Task(taskCount, msg.sender, _description, false, "");
        emit TaskCreated(taskCount, msg.sender, _description);
    }

    // 完成任务并上传对话日志
    function completeTask(uint _id, string memory _ipfsHash) public {
        require(_id > 0 && _id <= taskCount, "Invalid task ID");
        Task storage task = tasks[_id];
        require(!task.completed, "Task already completed");

        task.completed = true;
        task.ipfsHash = _ipfsHash; // 保存 IPFS 哈希
        emit TaskCompleted(_id, _ipfsHash);
    }

    // 获取任务
    function getTask(uint _id) public view returns (uint, address, string memory, bool, string memory) {
        Task memory task = tasks[_id];
        return (task.id, task.creator, task.description, task.completed, task.ipfsHash);
    }
}