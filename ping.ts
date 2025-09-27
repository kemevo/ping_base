/*
README (quick)

This is a single-file React component (Next.js compatible) that provides a "Ping" button which:
 - connects MetaMask
 - calls `ping()` on your deployed PingOnce contract
 - shows tx status and current uniquePings counter

How to use
1. Install dependencies in your Next.js project root:
   npm install ethers

2. Add Tailwind (optional) or adapt CSS. This component uses Tailwind classes.

3. Set environment variables in Vercel (or .env.local for local dev):
   NEXT_PUBLIC_CONTRACT_ADDRESS=0x...your deployed contract address...
   NEXT_PUBLIC_CHAIN_ID=8453  // optional, Base mainnet chain id

4. Drop this component into a page (e.g. app/page.tsx or pages/index.js) and export default.

5. Deploy to Vercel (connect GitHub, push repo, deploy). Ensure env vars are set in Vercel project settings.

Security notes
- This frontend expects the contract to implement `function ping() external` and `function uniquePings() public view returns (uint256)` and emits `event Ping(address indexed user, uint256 indexed count)`.
- No private keys are handled by the app; MetaMask signs transactions client-side.

*/

import React, { useEffect, useState } from "react";
import { ethers } from "ethers";

// Minimal ABI for PingOnce contract
const ABI = [
  {
    "inputs": [],
    "name": "ping",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function",
  },
  {
    "inputs": [],
    "name": "uniquePings",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function",
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "count", "type": "uint256" },
    ],
    "name": "Ping",
    "type": "event",
  },
];

export default function BasePingApp() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [status, setStatus] = useState("");
  const [uniquePings, setUniquePings] = useState(null);
  const [txHash, setTxHash] = useState("");

  const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

  useEffect(() => {
    if (!window.ethereum) return;
    const p = new ethers.providers.Web3Provider(window.ethereum, "any");
    setProvider(p);
  }, []);

  useEffect(() => {
    if (!provider) return;
    (async () => {
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        const s = provider.getSigner();
        setSigner(s);
      }
    })();
  }, [provider]);

  useEffect(() => {
    if (!signer || !CONTRACT_ADDRESS) return;
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    setContract(c);

    // listen for Ping events to refresh counter
    const onPing = (user, count) => {
      setUniquePings((prev) => {
        // set to count (big number -> number)
        try {
          return Number(count.toString());
        } catch (e) {
          return prev;
        }
      });
    };

    try {
      c.on("Ping", onPing);
    } catch (e) {
      // ignore
    }

    return () => {
      try {
        c.off("Ping", onPing);
      } catch (e) {}
    };
  }, [signer, CONTRACT_ADDRESS]);

  useEffect(() => {
    // fetch uniquePings if contract available (read-only via provider)
    if (!CONTRACT_ADDRESS) return;
    const readProvider = provider || (window.ethereum ? new ethers.providers.Web3Provider(window.ethereum) : null);
    if (!readProvider) return;
    const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);
    (async () => {
      try {
        const v = await readContract.uniquePings();
        setUniquePings(Number(v.toString()));
      } catch (e) {
        // ignore if function not present yet
      }
    })();
  }, [provider, CONTRACT_ADDRESS]);

  async function connectWallet() {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install MetaMask or a Web3 wallet.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      const p = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(p);
      setSigner(p.getSigner());
      setStatus("");
    } catch (e) {
      setStatus("Wallet connection rejected");
    }
  }

  async function doPing() {
    if (!contract) {
      setStatus("Contract not set. Make sure NEXT_PUBLIC_CONTRACT_ADDRESS is configured and MetaMask connected.");
      return;
    }

    try {
      setStatus("Sending transaction — waiting for wallet confirmation...");
      const tx = await contract.ping();
      setTxHash(tx.hash);
      setStatus("Transaction sent. Waiting for confirmation...");
      await tx.wait();
      setStatus("Confirmed! Thank you for pinging.");
      // refresh counter
      try {
        const v = await contract.uniquePings();
        setUniquePings(Number(v.toString()));
      } catch (e) {}
    } catch (err) {
      console.error(err);
      if (err?.data?.message) setStatus("Error: " + err.data.message);
      else if (err?.message) setStatus("Error: " + err.message);
      else setStatus("Transaction failed or rejected.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-md w-full bg-white/5 rounded-2xl p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold mb-2">Base Ping</h1>
        <p className="text-sm opacity-80 mb-4">Click <strong>Ping</strong> to call the contract. Each unique wallet can ping once.</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs opacity-70">Connected</div>
              <div className="text-sm truncate">{account ? account : 'No wallet connected'}</div>
            </div>
            <button
              onClick={connectWallet}
              className="px-3 py-1 rounded-xl bg-white/8 hover:bg-white/12 text-sm"
            >
              {account ? 'Reconnect' : 'Connect Wallet'}
            </button>
          </div>

          <div className="flex flex-col">
            <div className="text-xs opacity-70">Contract</div>
            <div className="text-sm break-all">{CONTRACT_ADDRESS || 'Set NEXT_PUBLIC_CONTRACT_ADDRESS'}</div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={doPing}
              className="flex-1 px-4 py-2 rounded-2xl bg-white/8 hover:bg-white/12 font-medium"
              disabled={!account || !CONTRACT_ADDRESS}
            >
              Ping
            </button>
            <div className="text-sm opacity-80">{uniquePings !== null ? `${uniquePings} unique pings` : '—'}</div>
          </div>

          <div className="text-xs opacity-70 break-words">
            <div>Status: {status || 'Idle'}</div>
            {txHash && (
              <div>
                Tx: <a className="underline" href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash}</a>
              </div>
            )}
          </div>

          <div className="text-xs opacity-60">Tip: Share the page with participants so they can open it and click Ping from their own wallets.</div>
        </div>
      </div>
    </div>
  );
}
