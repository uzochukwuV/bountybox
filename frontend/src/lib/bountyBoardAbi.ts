// BountyBoard contract ABI.
//
// Generated from the compiled artifact by scripts/export-abi.ts. Regenerate:
//   npx hardhat compile && npx hardhat run scripts/export-abi.ts
//
// Typed as const so viem infers function names and argument types.

export const BOUNTYBOARD_ABI = [
  {
    "inputs": [
      {
        "internalType": "contract IERC20",
        "name": "usdc_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyWinner",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyWorking",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ApplicationsClosed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CreatorCannotWork",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ExpiryNotReached",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientSurplus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidDeadlines",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidMaxWorkers",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReviewPeriod",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidWinners",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MaxWinnersReached",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MaxWorkersReached",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotCreator",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotWorking",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NothingPaid",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NothingToRescue",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnknownBounty",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WorkersPresent",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WrongStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroReward",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "refund",
        "type": "uint256"
      }
    ],
    "name": "BountyCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "BountyCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "rewardPerWinner",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "maxWinners",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "applicationDeadline",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "submissionDeadline",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "contentHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "maxWorkers",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "reviewPeriod",
        "type": "uint64"
      }
    ],
    "name": "BountyCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "refund",
        "type": "uint256"
      }
    ],
    "name": "BountyExpired",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "worker",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "submissionRef",
        "type": "bytes32"
      }
    ],
    "name": "BountyWinnerPaid",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "SurplusRescued",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "worker",
        "type": "address"
      }
    ],
    "name": "WorkStarted",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "worker",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "submissionRef",
        "type": "bytes32"
      }
    ],
    "name": "approveWork",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "bountyCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "cancelBounty",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rewardPerWinner",
        "type": "uint256"
      },
      {
        "internalType": "uint32",
        "name": "maxWinners",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "maxWorkers",
        "type": "uint32"
      },
      {
        "internalType": "uint64",
        "name": "applicationDeadline",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "submissionDeadline",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "reviewPeriod",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "contentHash",
        "type": "bytes32"
      }
    ],
    "name": "createBounty",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "expireBounty",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "finalizeBounty",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "getBounty",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "creator",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "applicationDeadline",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "submissionDeadline",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "reviewPeriod",
            "type": "uint64"
          },
          {
            "internalType": "enum BountyBoard.Status",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "maxWinners",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "maxWorkers",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "winnerCount",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "workerCount",
            "type": "uint32"
          },
          {
            "internalType": "uint256",
            "name": "rewardPerWinner",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "contentHash",
            "type": "bytes32"
          },
          {
            "internalType": "address[]",
            "name": "workers",
            "type": "address[]"
          },
          {
            "internalType": "address[]",
            "name": "winners",
            "type": "address[]"
          }
        ],
        "internalType": "struct BountyBoard.Bounty",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "getWinners",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "getWorkers",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "isFunded",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "worker",
        "type": "address"
      }
    ],
    "name": "isWinner",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "worker",
        "type": "address"
      }
    ],
    "name": "isWorking",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "remainingReward",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "rescueSurplus",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "startWorking",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "surplus",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalEscrowed",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "usdc",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
