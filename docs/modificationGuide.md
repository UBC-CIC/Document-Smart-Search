# Project Modification Guide

This guide provides instructions on how to modify and extend the project.

## Modifying Colors and Styles

Both `frontend` and `frontendAdmin` contain a Tailwind configuration file to manage themes and colours. Each configuration file is located at the root of each respective directory. You can adjust color themes by modifying the `colors` object inside the `tailwind.config.js` file:

```javascript
// tailwind.config.js
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        customMain: "#013366",
        customSecondary: "#4848A2",
        customAccent: "#F1F8FE",
        customBackground: "#f1f1f1",
        adminMain: "#26374a",
        adminSecondary: "#4848A2",
        adminAccent: "#F1F8FE",
        adminBackground: "#f1f1f1",
        // put additional colours here
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

## Extending the API

### Adding New Endpoints

1. **Implement the Lambda Function**: Create a new Lambda function in the `lambda` folder within the `cdk` directory. This function should handle the logic of the new endpoint.
2. **Edit the Api Stack**: In cdk/lib/api-gateway-stack.ts add the lambda function and override the logical id
3. **Define the Endpoint**: Update the `OpenAPI_Swagger_Definition.yaml` file with the new endpoint's specifications, request parameters, and responses. Use the new logical id for the `x-amazon-apigateway-integration:
uri:
  Fn::Sub:` field. Also ensure that the httpMethod field is POST even if the endpoint uses a different http method.
4. **Deploy**: Use AWS CDK to deploy changes to your infrastructure. Confirm that the new endpoint and Lambda function are correctly set up in your environment.

## Modifying Frontend Text and Icons

1. **Locate Components**:

   - For the main application UI, update components in `frontend/src/components`.
   - For the admin interface, update components in `frontendAdmin/src/components`.

2. **Modify Text and Icons**: Update specific text and icon configurations in each component file. Each component has its unique structure, so locate the relevant text or icon section within the component and make your changes.

For example, to change the text on the home page of the frontend, modify `frontend/src/components/home/PublicHome.jsx`.

After making the required changes in the fork created in the [Deployment Guide](./docs/deploymentGuide.md), the amplify deployment should automatically redeploy.

## Modifying the LLM

- **Change the model used in the application**:
  - Find `bedrockLLMParameter` in api-gateway-stack.ts
  - Change stringValue to the model ID of the model you would like to use. A list of thee available models and their IDs are listed [here](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html)
    For example to change the model to meta llama3 8b instruct, change `bedrockLLMParameter` to:

  ```typescript
  const bedrockLLMParameter = new ssm.StringParameter(
    this,
    "BedrockLLMParameter",
    {
      parameterName: "/DFO/BedrockLLMId",
      description: "Parameter containing the Bedrock LLM ID",
      stringValue: "us.meta.llama3-3-70b-instruct-v1:0',
    }
  );

  ```

  - Add permissions to invoke the model selected by finding `bedrockPolicyStatement` and changing the model id.
    For example to change the model to meta llama3 8b instruct, change `bedrockPolicyStatement` to:

  ```typescript
  const bedrockPolicyStatement = new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["bedrock:InvokeModel", "bedrock:InvokeEndpoint"],
    resources: [
      "arn:aws:bedrock:" +
        this.region +
        "::foundation-model/us.meta.llama3-3-70b-instruct-v1:0",
      "arn:aws:bedrock:" +
        this.region +
        "::foundation-model/amazon.titan-embed-text-v2:0",
    ],
  });
  ```

  - redeploy the application by using the cdk deploy command in the deployment guide.
  - The `system_prompt` in `cdk/text_generation/src/helpers/chat.py` and the prompts in the administrator view may require updates when switching models.

## Additional Notes

- **Frontend Styling**: Both `frontend` and `frontendAdmin` can use Tailwind classes to adjust styling.
- **Tailwind Animations**: Tailwind animations can be configured in the `plugins` section of the Tailwind configuration file for additional animated effects.
