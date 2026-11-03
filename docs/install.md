# Installation

Use Node.js 20 and npm. From the repository root:

```sh
npm ci
npm test
npm run demo
```

The demo does not require a database, environment file or credentials. If `tsx` cannot create its local IPC socket in a restricted sandbox, use `node --import tsx demo/run.ts` to execute the same entry point.

Python 3 is optional for the synthetic sidecars and their tests:

```sh
python3 -m unittest discover -s tests-py
python3 services/voice/main.py
```

The voice sidecar uses synthetic providers and listens locally; a sandbox may prohibit binding sockets. The document converter has an optional local Docling integration that is not required for the offline demo. See its source before choosing to install any optional dependencies.
