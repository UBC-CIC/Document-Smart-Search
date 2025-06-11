const { initializeConnection } = require("./lib.js");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT } = process.env;
let sqlConnection = global.sqlConnection;

exports.handler = async (event) => {
  if (!sqlConnection) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
    sqlConnection = global.sqlConnection;
  }

  const { userName, userPoolId } = event;
  const client = new CognitoIdentityProviderClient();

  try {
    // Get user attributes from Cognito to retrieve the email
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: userName,
    });
    const userAttributesResponse = await client.send(getUserCommand);

    const emailAttr = userAttributesResponse.UserAttributes.find(
      (attr) => attr.Name === "email"
    );
    const email = emailAttr ? emailAttr.Value : null;

    // Update the last_sign_in field to the current timestamp
    await sqlConnection`
      UPDATE "users"
      SET last_sign_in = CURRENT_TIMESTAMP
      WHERE user_email = ${email};
    `;

    return event;
  } catch (err) {
    console.error("Error updating user last_sign_in timestamp:", err);
    return event;
  }
};