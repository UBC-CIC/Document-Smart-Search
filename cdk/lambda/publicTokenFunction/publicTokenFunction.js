const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const jwt = require("jsonwebtoken");

const secretsManager = new SecretsManagerClient();
let cachedSecret;

exports.handler = async () => {
  try {
    if (!cachedSecret) {
      const response = await secretsManager.send(
        new GetSecretValueCommand({ SecretId: process.env.JWT_SECRET })
      );
      cachedSecret = JSON.parse(response.SecretString).jwtSecret;
    }

    const token = jwt.sign(
      { role: "user" },
      cachedSecret,
      { expiresIn: "2h" }
    );
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,OPTIONS"
      },
      body: JSON.stringify({ token }),
    };
  } catch (error) {
    console.error("Token generation error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to generate token" }),
    };
  }
};
