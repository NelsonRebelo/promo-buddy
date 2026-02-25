

## Update OAuth Credentials

Two environment secrets need to be updated with the correct values:

1. **VAS_CLIENT_ID**: Update to `102`
2. **CLIENT_SECRET**: Update to `fe2f42b47398e2f25ee8501d1afecb2c`

These are used by the backend function to authenticate with the upstream OAuth provider. After updating, no code changes are needed -- the existing backend function already reads these values from the environment.

Once approved, I will use the secret management tool to request you to input the new values for both secrets.

