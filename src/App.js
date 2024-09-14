import React, { useState, useEffect } from 'react';
import * as StellarSdk from 'stellar-sdk';
import './App.css';

function App() {
  const [name, setName] = useState('');
  const [output, setOutput] = useState('Waiting for authentication');
  const [result, setResult] = useState('');
  const [publicKey, setPublicKey] = useState(null);

  useEffect(() => {
    if (window.PublicKeyCredential) {
      setOutput(output+`<br />WebAuthn is supported`);
    } else {
      setOutput(output+`<br />WebAuthn is not supported`);
    }
  }, []);
  const rpc = new StellarSdk.SorobanRpc.Server("https://soroban-testnet.stellar.org");
  const contractId = 'CAAD24Y7OVOZQRFSVAW2Z4MA6JZEF6GPQYR2F2R3N7WTQLEHL2ZTEUBN';
  const contract = new StellarSdk.Contract(contractId);
  const secret = 'SBZZ6QJC7Y3ZIGZBSTRN3W6QNDWISVDWH3JHME7DKAXS7DXMYZY7LE4E';
  const accountPublicKey = 'GAAVHTZYE6O4BIKRVZCVQCEIKVVDR2ZIRPWGV6TVPB5UYTJR7HSKIKTK';
  const networkPassphrase = StellarSdk.Networks.TESTNET;

  const registerWebAuthn = async () => {
    setOutput(output+`<br />Requesting new signature`);
    try {
      const publicKeyCredential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32),
          rp: {
            name: "WebAuthn PassKey",
            id: window.location.hostname,
          },
          user: {
            id: new Uint8Array(16),
            name: "Stellar User",
            displayName: "WebAuthn User",
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
        },
      });
      setOutput(output+`<br />Challenge response received`);
      const publicKeyArray = new Uint8Array(publicKeyCredential.response.getPublicKey());
      const hexString =  Array.from(publicKeyArray).map(byte => byte.toString(16).padStart(2, '0')).join('');
      setPublicKey(hexString);
      setResult("WebAuthn registered successfully");
    } catch (error) {
      console.error("Error registering WebAuthn:", error);
      setResult("Error registering WebAuthn");
    }
  };

  const signWebAuthn = async (challenge) => {
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: new TextEncoder().encode(challenge),
          allowCredentials: [
            {
              type: "public-key",
              id: publicKey,
            },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      });

      return {
        authenticatorData: new Uint8Array(assertion.response.authenticatorData),
        clientDataJSON: new Uint8Array(assertion.response.clientDataJSON),
        signature: new Uint8Array(assertion.response.signature),
      };
    } catch (error) {
      console.error("Error signing with WebAuthn:", error);
      return null;
    }
  };

  const callHelloWorld = async () => {
    try {
      const account = await rpc.getAccount(accountPublicKey);
      const input = StellarSdk.nativeToScVal(name, { type: "string" });

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addOperation(contract.call("hello", input))
        .setTimeout(30)
        .build();

      const preparedTx = await rpc.prepareTransaction(tx);

      // Sign the transaction using WebAuthn
      const webAuthnSignature = await signWebAuthn(preparedTx.hash().toString('hex'));
      if (!webAuthnSignature) {
        setResult('WebAuthn signature failed');
        return;
      }

      // For demo purposes, we're still using the secret key to sign
      // In a real implementation, you would use the WebAuthn signature
      preparedTx.sign(StellarSdk.Keypair.fromSecret(secret));

      const txResult = await rpc.sendTransaction(preparedTx);
      const hash = txResult.hash;

      await new Promise(r => setTimeout(r, 10000));
      let getResponse = await rpc.getTransaction(hash);

      const decoder = new TextDecoder();
      const string1 = decoder.decode(getResponse.returnValue._value[0]._value);
      const string2 = decoder.decode(getResponse.returnValue._value[1]._value);
      setResult(`${string1} ${string2}`);
    } catch (error) {
      console.error("Error calling contract:", error);
      setResult('Error calling contract');
    }
  };

  return (
    <div className="App">
      <h1>WebAuthn Passkey</h1>
      <div id="output" dangerouslySetInnerHTML={{ __html: output }}></div>
      <div>
        <strong>Public Key:</strong> {publicKey}
      </div>
      <div>
        <strong>Result:</strong> {result}
      </div>
      <button onClick={registerWebAuthn}>
        Authenticate
      </button>
      <button onClick={signWebAuthn}>
        Sign Transaction
      </button>

    </div>
  );
}

export default App;