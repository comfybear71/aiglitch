"use client";

import { useState } from "react";
import { Keypair } from "@solana/web3.js";
import { mnemonicToSeedSync, mnemonicToEntropy, validateMnemonic } from "bip39";
import { derivePath } from "ed25519-hd-key";
import bs58 from "bs58";
import nacl from "tweetnacl";

const DERIVATION_PATHS = [
  {
    label: "Direct entropy (older Solana CLI)",
    path: "entropy",
    description: "Mnemonic encodes the private key directly — used by older solana-keygen",
  },
  {
    label: "Raw seed (first 32 bytes)",
    path: "raw-seed",
    description: "BIP39 seed used directly as private key, no HD derivation",
  },
  {
    label: "Solana CLI default",
    path: "m/44'/501'",
    description: "Used by solana-keygen new",
  },
  {
    label: "Solana CLI with account 0",
    path: "m/44'/501'/0'",
    description: "Solana CLI with account index",
  },
  {
    label: "Phantom / Backpack / Solflare",
    path: "m/44'/501'/0'/0'",
    description: "Standard BIP44 used by browser/mobile wallets",
  },
  {
    label: "BIP44 account 1",
    path: "m/44'/501'/1'/0'",
    description: "Second account in wallet apps",
  },
  {
    label: "BIP44 account 2",
    path: "m/44'/501'/2'/0'",
    description: "Third account in wallet apps",
  },
];

interface DerivedWallet {
  path: string;
  label: string;
  publicKey: string;
  privateKeyBase58: string;
}

export default function DeriveWalletPage() {
  const [mnemonic, setMnemonic] = useState("");
  const [results, setResults] = useState<DerivedWallet[]>([]);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [targetAddress, setTargetAddress] = useState("");

  const deriveAll = () => {
    setError("");
    setResults([]);

    const cleaned = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");

    if (!validateMnemonic(cleaned)) {
      setError(
        "Invalid mnemonic. Check spelling and word count (usually 12 or 24 words)."
      );
      return;
    }

    try {
      const seed = mnemonicToSeedSync(cleaned);
      const derived: DerivedWallet[] = [];

      for (const dp of DERIVATION_PATHS) {
        try {
          let secretKey: Uint8Array;

          if (dp.path === "entropy") {
            // Older Solana CLI: mnemonic entropy IS the private key
            const entropyHex = mnemonicToEntropy(cleaned);
            const entropyBytes = Uint8Array.from(
              Buffer.from(entropyHex, "hex")
            );
            // 24 words = 32 bytes entropy, 12 words = 16 bytes (pad to 32)
            const keyBytes = new Uint8Array(32);
            keyBytes.set(entropyBytes);
            const fullKey = nacl.sign.keyPair.fromSeed(keyBytes);
            secretKey = fullKey.secretKey;
          } else if (dp.path === "raw-seed") {
            // Use first 32 bytes of BIP39 seed directly
            const keyBytes = Uint8Array.from(seed.subarray(0, 32));
            const fullKey = nacl.sign.keyPair.fromSeed(keyBytes);
            secretKey = fullKey.secretKey;
          } else {
            // Standard HD derivation with BIP44 path
            const { key } = derivePath(dp.path, seed.toString("hex"));
            const keypair = Keypair.fromSeed(Uint8Array.from(key));
            secretKey = keypair.secretKey;
          }

          const keypair = Keypair.fromSecretKey(secretKey);
          const privateKeyBase58 = bs58.encode(keypair.secretKey);
          derived.push({
            path: dp.path,
            label: dp.label,
            publicKey: keypair.publicKey.toBase58(),
            privateKeyBase58,
          });
        } catch {
          // Skip paths that fail (e.g. 12-word entropy too short for some methods)
        }
      }

      setResults(derived);
    } catch (err) {
      setError(`Derivation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(""), 2000);
    } catch {
      // Fallback for iPad/iOS
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(""), 2000);
    }
  };

  const matchingAddress = targetAddress.trim();

  return (
    <div className="min-h-screen bg-black text-white p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-400 mb-2">
          Wallet Key Derivation Tool
        </h1>
        <p className="text-gray-400 text-sm">
          Derive your Solana CLI private key from your seed phrase. Everything
          runs locally in your browser — nothing is sent to any server.
        </p>
      </div>

      {/* Security Notice */}
      <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-3 mb-6">
        <p className="text-yellow-400 text-sm font-bold">SECURITY</p>
        <p className="text-yellow-300 text-xs mt-1">
          This page runs 100% client-side. Your seed phrase and private keys
          never leave this device. Still — close this tab when done and clear
          your clipboard after importing.
        </p>
      </div>

      {/* Optional: target address */}
      <div className="mb-4">
        <label className="block text-gray-400 text-sm mb-1">
          Your minting wallet address (optional — to highlight the match)
        </label>
        <input
          type="text"
          value={targetAddress}
          onChange={(e) => setTargetAddress(e.target.value)}
          placeholder="e.g. 6mWQUxNk..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-green-500 focus:outline-none"
        />
      </div>

      {/* Mnemonic Input */}
      <div className="mb-4">
        <label className="block text-gray-400 text-sm mb-1">
          Seed Phrase (12 or 24 words)
        </label>
        <textarea
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          placeholder="Enter your seed phrase words separated by spaces..."
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-green-500 focus:outline-none resize-none"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      <button
        onClick={deriveAll}
        className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-3 rounded-lg mb-6 transition-colors"
      >
        Derive Wallets
      </button>

      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-3 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-green-400">
              Derived Addresses
            </h2>
            <button
              onClick={() => setShowKeys(!showKeys)}
              className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded px-3 py-1"
            >
              {showKeys ? "Hide Private Keys" : "Show Private Keys"}
            </button>
          </div>

          <div className="space-y-4">
            {results.map((r) => {
              const isMatch =
                matchingAddress &&
                r.publicKey === matchingAddress;
              return (
                <div
                  key={r.path}
                  className={`border rounded-lg p-4 ${
                    isMatch
                      ? "border-green-500 bg-green-900/20"
                      : "border-gray-700 bg-gray-900/50"
                  }`}
                >
                  {isMatch && (
                    <div className="text-green-400 font-bold text-sm mb-2">
                      MATCH FOUND — This is your minting wallet
                    </div>
                  )}
                  <div className="text-gray-400 text-xs mb-1">{r.label}</div>
                  <div className="text-gray-500 text-xs mb-2 font-mono">
                    Path: {r.path}
                  </div>

                  {/* Public Key */}
                  <div className="mb-2">
                    <div className="text-gray-400 text-xs mb-1">
                      Public Key (Address)
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-green-300 text-xs break-all flex-1">
                        {r.publicKey}
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(r.publicKey, `pub-${r.path}`)
                        }
                        className="text-xs text-gray-500 hover:text-white shrink-0"
                      >
                        {copiedField === `pub-${r.path}` ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Private Key */}
                  {showKeys && (
                    <div>
                      <div className="text-gray-400 text-xs mb-1">
                        Private Key (Base58) — import this into Phantom
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-yellow-300 text-xs break-all flex-1">
                          {r.privateKeyBase58}
                        </code>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              r.privateKeyBase58,
                              `priv-${r.path}`
                            )
                          }
                          className="text-xs text-gray-500 hover:text-white shrink-0"
                        >
                          {copiedField === `priv-${r.path}`
                            ? "Copied!"
                            : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Instructions */}
          <div className="mt-6 bg-gray-900 border border-gray-700 rounded-lg p-4">
            <h3 className="text-green-400 font-bold text-sm mb-2">
              Next Steps
            </h3>
            <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
              <li>
                Find which address matches your minting wallet (enter it above
                to auto-highlight)
              </li>
              <li>
                Click &quot;Show Private Keys&quot; and copy the Base58 private key for
                the matching address
              </li>
              <li>
                Open Phantom on your device → Settings → Add/Connect Wallet →
                Import Private Key
              </li>
              <li>Paste the Base58 key — you now have your minting wallet</li>
              <li>
                Go to{" "}
                <a
                  href="https://jup.ag/verify"
                  target="_blank"
                  className="text-green-400 underline"
                >
                  jup.ag/verify
                </a>{" "}
                and connect to verify $GLITCH
              </li>
              <li>Clear your clipboard and close this tab when done</li>
            </ol>
          </div>
        </>
      )}

      {/* Back link */}
      <div className="mt-8 text-center">
        <a href="/" className="text-gray-500 hover:text-white text-sm">
          ← Back to AIG!itch
        </a>
      </div>
    </div>
  );
}
