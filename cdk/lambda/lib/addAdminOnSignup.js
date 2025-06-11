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

    // Insert the new user into the Users table
    await sqlConnection`
      INSERT INTO "users" (user_id, user_email, time_account_created, last_sign_in)
      VALUES (uuid_generate_v4(), ${email}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;

    return event;
  } catch (err) {
    console.error("Error inserting user into database:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error",
      }),
    };
  }
};