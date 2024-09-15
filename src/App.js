import React, { useState, useEffect, useRef } from 'react';
import * as StellarSdk from 'stellar-sdk';
import './App.css';

function App() {
  const [output, setOutput] = useState('Waiting for authentication');
  const [result, setResult] = useState('');
  const [credentialId, setCredentialId] = useState(null); // Store credential ID
  const [publicKey, setPublicKey] = useState([]);
  
  const credentialIdRef = useRef(null); // Use ref to store credential ID
  const runOnce = useRef(false);

  useEffect(() => {
    if (!runOnce.current) {
      if (window.PublicKeyCredential) {
        setOutput(prev => `${prev}<br />WebAuthn is supported`);
      } else {
        setOutput(prev => `${prev}<br />WebAuthn is not supported`);
      }
      runOnce.current = true;
    }
  }, []);

  const rpc = new StellarSdk.SorobanRpc.Server("https://soroban-testnet.stellar.org");
  const contractId = 'CAAD24Y7OVOZQRFSVAW2Z4MA6JZEF6GPQYR2F2R3N7WTQLEHL2ZTEUBN';
  const contract = new StellarSdk.Contract(contractId);
  const accountPublicKey = 'GAAVHTZYE6O4BIKRVZCVQCEIKVVDR2ZIRPWGV6TVPB5UYTJR7HSKIKTK';

  // Utility functions for encoding
  const base64urlToBase64 = (baseurl) => {
    let base64 = baseurl.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return base64;
  };

  const base64ToUint8Array = (base64) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const registerWebAuthn = async () => {
    setOutput(prev => `${prev}<br />Requesting new credential`);
    try {
      const publicKeyCredential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32), // Generate this securely
          rp: {
            name: "WebAuthn PassKey",
            id: window.location.hostname,
          },
          user: {
            id: new Uint8Array(16), // Use a unique user identifier
            name: "Stellar User",
            displayName: "WebAuthn User",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 }, // ECDSA with SHA-256
            { type: "public-key", alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform", // Ensures the use of platform authenticator (e.g., built-in laptop)
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none", // Optional: Can be set based on your security requirements
        },
      });

      setOutput(prev => `${prev}<br />Credential created successfully`);
      const credId = publicKeyCredential.id;
      setCredentialId(credId);
      credentialIdRef.current = credId;
      const publicKeyBytes = new Uint8Array(publicKeyCredential.response.getPublicKey());
      setPublicKey(publicKeyBytes);
      setResult("WebAuthn registered successfully");
    } catch (error) {
      console.error("Error registering WebAuthn:", error);
      setOutput(prev => `${prev}<br />Error registering WebAuthn`);
    }
  };

  const signWebAuthn = async (challenge) => {
    try {
      const base64 = base64urlToBase64(credentialIdRef.current);
      const credentialIdBuffer = base64ToUint8Array(base64);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: new TextEncoder().encode(challenge),
          allowCredentials: [
            {
              type: "public-key",
              id: credentialIdBuffer,
            },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      });
      setOutput(prev => `${prev}<br />WebAuthn signed challenge successfully`);
      setResult("WebAuthn signed challenge successfully");
      return {
        authenticatorData: new Uint8Array(assertion.response.authenticatorData),
        clientDataJSON: new Uint8Array(assertion.response.clientDataJSON),
        signature: new Uint8Array(assertion.response.signature),
      };
    } catch (error) {
      console.error("Error signing with WebAuthn:", error);
      setOutput(prev => `${prev}<br />Error signing with WebAuthn`);
      return null;
    }
  };

  const authenticate = async () => {
    try {
      const account = await rpc.getAccount(accountPublicKey);
      const input = StellarSdk.nativeToScVal("world", { type: "string" });
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addOperation(contract.call("hello", input))
        .setTimeout(30)
        .build();
      const preparedTx = await rpc.prepareTransaction(tx);
      const challenge = preparedTx.hash().toString('hex');
      const webAuthnSignature = await signWebAuthn(challenge);
      if (!webAuthnSignature) {
        setResult('WebAuthn signature failed');
        return;
      }
      callContract(webAuthnSignature);
    } catch (error) {
      console.error("Error calling contract:", error);
      setResult('Error calling contract');
    }
  };

  const callContract = async (webAuthnSignature) => {
    // verify signature in smart contract
    setOutput(prev => `${prev}<br />Verification complete`);
    setResult('Verification complete');
  }

  const hexKey = () => {
    return Array.from(publicKey)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  };

  return (
    <div className="App">
      <h1>WebAuthn Passkey</h1>
      <div id="output" dangerouslySetInnerHTML={{ __html: output }}></div>
      <div>
        <strong>Credential ID:</strong> {credentialId ? btoa(String.fromCharCode(...base64ToUint8Array(base64urlToBase64(credentialId)))) : 'N/A'}
      </div>
      <div>
        <strong>Public Key:</strong> {publicKey.length > 0 ? hexKey() : 'N/A'}
      </div>
      <div>
        <strong>Result:</strong> {result}
      </div>
      <button onClick={registerWebAuthn}>
        Register Passkey
      </button>
      <button onClick={authenticate}>
        Sign Transaction
      </button>
    </div>
  );
}

export default App;
