const { initializeConnection } = require("./lib.js");
let { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT, USER_POOL } = process.env;

// SQL conneciton from global variable at lib.js
let sqlConnection = global.sqlConnection;

exports.handler = async (event) => {
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
    },
    body: "",
  };

  // Initialize the database connection if not already initialized
  if (!sqlConnection) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
    sqlConnection = global.sqlConnection;
  }

  let data;
  try {
    const pathData = event.httpMethod + " " + event.resource;
    switch (pathData) {
      case "POST /user/create_feedback":
        if (
          event.queryStringParameters.user_info &&
          event.queryStringParameters.user_role &&
          event.queryStringParameters.session_id &&
          event.queryStringParameters.feedback_rating &&
          event.queryStringParameters.feedback_description
        ) {
          const userInfo = event.queryStringParameters.user_info;
          const userRole = event.queryStringParameters.user_role;
          const sessionId = event.queryStringParameters.session_id;
          const feedbackRating = event.queryStringParameters.feedback_rating;
          const feedbackDescription =
            event.queryStringParameters.feedback_description;

          try {
            const feedbackData = await sqlConnection`
                    INSERT INTO feedback (feedback_id, session_id, feedback_rating, feedback_description, timestamp)
                    VALUES (
                      uuid_generate_v4(),
                      ${sessionId},
                      ${feedbackRating},
                      ${feedbackDescription},
                      CURRENT_TIMESTAMP
                    )
                    RETURNING *;
                `;
            const feedbackId = feedbackData[0]?.feedback_id;

            if (feedbackId) {
              await sqlConnection`
                      INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, engagement_details, user_info, user_role)
                      VALUES (
                        uuid_generate_v4(),
                        ${sessionId},
                        CURRENT_TIMESTAMP,
                        'feedback creation',
                        ${feedbackRating},
                        ${userInfo},
                        ${userRole}
                      )
                    `;
            }

            response.body = JSON.stringify(feedbackData);
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "Invalid value",
          });
        }
        break;
      case "POST /user/create_session":
        if (event.queryStringParameters.user_info) {
          const userInfo = event.queryStringParameters.user_info;
          try {
            const sessionData = await sqlConnection`
                  INSERT INTO sessions (session_id, time_created)
                  VALUES (
                    uuid_generate_v4(),
                    CURRENT_TIMESTAMP
                  )
                  RETURNING *;
              `;
            const sessionId = sessionData[0]?.session_id;

            if (sessionId) {
              await sqlConnection`
                    INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info)
                    VALUES (
                      uuid_generate_v4(),
                      ${sessionId},
                      CURRENT_TIMESTAMP,
                      'session creation',
                      ${userInfo}
                    )
                  `;
            }

            response.body = JSON.stringify(sessionData);
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "Invalid value",
          });
        }
        break;

        case "GET /user/chart_data":
          const mockChartData = [
            { year: 2010, salmon: 26, "climate-change": 45, aquaculture: 20 },
            { year: 2011, salmon: 34, "climate-change": 37, aquaculture: 28 },
            { year: 2012, salmon: 49, "climate-change": 31, aquaculture: 35 },
            { year: 2013, salmon: 48, "climate-change": 9, aquaculture: 40 },
            { year: 2014, salmon: 46, "climate-change": 19, aquaculture: 45 },
            { year: 2015, salmon: 5, "climate-change": 25, aquaculture: 50 },
            { year: 2016, salmon: 9, "climate-change": 23, aquaculture: 30 },
            { year: 2017, salmon: 9, "climate-change": 16, aquaculture: 22 },
            { year: 2018, salmon: 41, "climate-change": 33, aquaculture: 19 },
            { year: 2019, salmon: 10, "climate-change": 15, aquaculture: 21 },
            { year: 2020, salmon: 29, "climate-change": 7, aquaculture: 30 },
            { year: 2021, salmon: 47, "climate-change": 28, aquaculture: 50 },
            { year: 2022, salmon: 25, "climate-change": 15, aquaculture: 40 },
            { year: 2023, salmon: 20, "climate-change": 11, aquaculture: 30 }
          ];
          
          exports.handler = async (event) => {
            const { startDate, endDate, topics } = event.queryStringParameters;
          
            // Convert the start and end dates from the query parameters
            const start = new Date(startDate);
            const end = new Date(endDate);
            const selectedTopics = topics ? topics.split(',') : [];
          
            // Filter the chart data based on the selected date range and topics
            const filteredData = mockChartData.filter(item => {
              const year = item.year;
              return year >= start.getFullYear() && year <= end.getFullYear();
            }).map(item => {
              const filteredItem = { year: item.year };
              selectedTopics.forEach(topic => {
                if (item[topic]) {
                  filteredItem[topic] = item[topic];
                }
              });
              return filteredItem;
            });
          
            // Return the filtered data as JSON
            return {
              statusCode: 200,
              body: JSON.stringify(filteredData)
            };
          };
          break;

          case "GET /user/topics":
            const mockTopics = [
              { label: "Salmon", value: "salmon" },
              { label: "Climate Change", value: "climate-change" },
              { label: "Aquaculture", value: "aquaculture" },
              { label: "Conservation", value: "conservation" },
              { label: "Fisheries", value: "fisheries" },
              { label: "Biodiversity", value: "biodiversity" },
            ];
            
            exports.handler = async (event) => {
              // Return the list of topics as JSON
              return {
                statusCode: 200,
                body: JSON.stringify(mockTopics)
              };
            };
            break;
      default:
        throw new Error(`Unsupported route: "${pathData}"`);
    }
  } catch (error) {
    response.statusCode = 400;
    console.log(error);
    response.body = JSON.stringify(error.message);
  }
  console.log(response);

  return response;
};
