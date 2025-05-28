const { initializeConnection } = require("./libadmin.js")
const postgres = require('postgres');
const sql = postgres();

const { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT } = process.env

// SQL conneciton from global variable at libadmin.js
let sqlConnectionTableCreator = global.sqlConnectionTableCreator

exports.handler = async (event) => {
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
    },
    body: "",
  }

  // Initialize the database connection if not already initialized
  if (!sqlConnectionTableCreator) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT)
    sqlConnectionTableCreator = global.sqlConnectionTableCreator
  }

  // Function to format user full names (lowercase and spaces replaced with "_")
  const formatNames = (name) => {
    return name.toLowerCase().replace(/\s+/g, "_")
  }

  let data
  try {
    const pathData = event.httpMethod + " " + event.resource
    switch (pathData) {
      case "GET /admin/analytics":
        try {
          // Get time frame from query parameters, default to 'month'
          const timeFrame = event.queryStringParameters?.timeFrame || "month"

          // Get current date
          const currentDate = new Date()

          // Set the start date based on the time frame
          const startDate = new Date()

          switch (timeFrame) {
            case "day":
              // For day view, show the past 7 days
              startDate.setDate(startDate.getDate() - 7)
              break
            case "week":
              // For week view, show the past 3 months (approximately 12-13 weeks)
              startDate.setMonth(startDate.getMonth() - 3)
              break
            case "year":
              // For year view, show the past 5 years
              startDate.setFullYear(startDate.getFullYear() - 5)
              break
            case "month":
            default:
              // For month view, show the past year (12 months)
              startDate.setFullYear(startDate.getFullYear() - 1)
              break
          }

          // Determine the date truncation based on the requested time frame
          let dateTrunc
          let interval

          switch (timeFrame) {
            case "day":
              dateTrunc = "day"
              interval = "1 day"
              break
            case "week":
              dateTrunc = "week"
              interval = "1 week"
              break
            case "year":
              dateTrunc = "year"
              interval = "1 year"
              break
            case "month":
            default:
              dateTrunc = "month"
              interval = "1 month"
              break
          }

          // SQL query to get the number of unique users per time period
          const uniqueUsersPerTimePeriod = await sqlConnectionTableCreator`
            WITH time_periods AS (
              SELECT generate_series(
                date_trunc(${dateTrunc}, ${startDate}::date),
                date_trunc(${dateTrunc}, ${currentDate}::date),
                ${interval}
              ) AS period
            )
            SELECT 
              to_char(t.period, 'YYYY-MM-DD') AS time_period,
              COALESCE(COUNT(DISTINCT uel.user_info), 0) AS unique_users
            FROM time_periods t
            LEFT JOIN user_engagement_log uel
              ON DATE_TRUNC(${dateTrunc}, uel.timestamp) = t.period
            GROUP BY t.period
            ORDER BY t.period;
          `

          // SQL query to get the number of messages per time period per user_role
          const messagesPerRolePerTimePeriod = await sqlConnectionTableCreator`
            WITH time_periods AS (
              SELECT generate_series(
                date_trunc(${dateTrunc}, ${startDate}::date),
                date_trunc(${dateTrunc}, ${currentDate}::date),
                ${interval}
              ) AS period
            )
            SELECT 
              to_char(t.period, 'YYYY-MM-DD') AS time_period,
              COALESCE(uel.user_role, 'unknown') AS user_role,
              COUNT(CASE WHEN uel.engagement_type = 'message creation' THEN 1 END) AS message_count
            FROM time_periods t
            LEFT JOIN user_engagement_log uel
              ON DATE_TRUNC(${dateTrunc}, uel.timestamp) = t.period
            GROUP BY t.period, uel.user_role
            ORDER BY t.period, uel.user_role;
          `

          // SQL query to get the total average feedback rating for each user_role
          const totalFeedbackAveragePerRole = await sqlConnectionTableCreator`
            SELECT 
              COALESCE(uel.user_role, 'unknown') AS user_role,
              AVG(fb.feedback_rating) AS avg_feedback_rating
            FROM feedback fb
            LEFT JOIN user_engagement_log uel
              ON fb.session_id = uel.session_id
            GROUP BY uel.user_role;
          `

          const formattedFeedback = totalFeedbackAveragePerRole.map((role) => ({
            user_role: role.user_role,
            avg_feedback_rating: role.avg_feedback_rating !== null ? role.avg_feedback_rating : "no feedback yet",
          }))

          // Format the data based on the time frame
          const formattedUniqueUsers = uniqueUsersPerTimePeriod.map((item) => {
            // For month and year views, we'll format the date differently
            if (timeFrame === "month") {
              return {
                month: item.time_period.substring(0, 7), // YYYY-MM format
                unique_users: item.unique_users,
              }
            } else if (timeFrame === "year") {
              return {
                month: item.time_period.substring(0, 4), // YYYY format
                unique_users: item.unique_users,
              }
            } else {
              // For day and week, keep the full date
              return {
                month: item.time_period, // YYYY-MM-DD format
                unique_users: item.unique_users,
              }
            }
          })

          const formattedMessagesPerRole = messagesPerRolePerTimePeriod.map((item) => {
            // For month and year views, we'll format the date differently
            if (timeFrame === "month") {
              return {
                month: item.time_period.substring(0, 7), // YYYY-MM format
                user_role: item.user_role,
                message_count: item.message_count,
              }
            } else if (timeFrame === "year") {
              return {
                month: item.time_period.substring(0, 4), // YYYY format
                user_role: item.user_role,
                message_count: item.message_count,
              }
            } else {
              // For day and week, keep the full date
              return {
                month: item.time_period, // YYYY-MM-DD format
                user_role: item.user_role,
                message_count: item.message_count,
              }
            }
          })

          // Return the combined data in the response
          response.body = JSON.stringify({
            unique_users_per_month: formattedUniqueUsers,
            messages_per_role_per_month: formattedMessagesPerRole,
            avg_feedback_per_role: formattedFeedback,
            time_frame: timeFrame,
            date_range: {
              start: startDate.toISOString().split("T")[0],
              end: currentDate.toISOString().split("T")[0],
            },
          })
        } catch (err) {
          response.statusCode = 500
          console.error(err)
          response.body = JSON.stringify({ error: "Internal server error" })
        }
        break
      case "POST /admin/create_category":
        if (event.queryStringParameters.category_name && event.queryStringParameters.category_number) {
          const { category_name, category_number } = event.queryStringParameters
          try {
            // Insert the new category
            const categoryData = await sqlConnectionTableCreator`
                INSERT INTO categories (category_id, category_name, category_number)
                VALUES (
                  uuid_generate_v4(),
                  ${category_name},
                  ${category_number}
                )
                RETURNING *;
              `

            // Insert a record into the user engagement log
            await sqlConnectionTableCreator`
                INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info, user_role)
                VALUES (
                  uuid_generate_v4(),
                  NULL,
                  CURRENT_TIMESTAMP,
                  'category creation',
                  NULL,
                  'admin'
                )
              `

            response.statusCode = 201
            response.body = JSON.stringify({
              category_id: categoryData[0]?.category_id,
              category_name: categoryData[0]?.category_name,
              category_number: categoryData[0]?.category_number,
            })
          } catch (err) {
            response.statusCode = 500
            console.error(err)
            response.body = JSON.stringify({ error: "Internal server error" })
          }
        } else {
          response.statusCode = 400
          response.body = JSON.stringify({
            error: "Invalid value: category_name and category_number are required.",
          })
        }
        break
      case "GET /admin/categories":
        try {
          // Query to get all categories
          const categoriesData = await sqlConnectionTableCreator`
            SELECT category_id, category_name, category_number
            FROM categories
            ORDER BY category_number ASC;
          `

          response.statusCode = 200
          response.body = JSON.stringify(categoriesData)
        } catch (err) {
          response.statusCode = 500
          console.error(err)
          response.body = JSON.stringify({ error: "Internal server error" })
        }
        break
      case "PUT /admin/edit_category":
        if (
          event.queryStringParameters.category_id &&
          event.queryStringParameters.category_name &&
          event.queryStringParameters.category_number
        ) {
          const editCategoryId = event.queryStringParameters.category_id
          const editCategoryName = event.queryStringParameters.category_name
          const editCategoryNumber = event.queryStringParameters.category_number

          try {
            // Update category query
            const updateResult = await sqlConnectionTableCreator`
              UPDATE categories
              SET category_name = ${editCategoryName}, category_number = ${editCategoryNumber}
              WHERE category_id = ${editCategoryId}
              RETURNING *;
            `

            if (updateResult.length === 0) {
              response.statusCode = 404
              response.body = JSON.stringify({ error: "Category not found" })
            } else {
              const userRole = "admin"
              const engagementType = "category edited"

              await sqlConnectionTableCreator`
                INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info, user_role)
                VALUES (
                  uuid_generate_v4(),
                  NULL,
                  CURRENT_TIMESTAMP,
                  ${engagementType},
                  NULL,
                  ${userRole}
                )
              `

              response.statusCode = 200
              response.body = JSON.stringify(updateResult[0])
            }
          } catch (err) {
            response.statusCode = 500
            console.error(err)
            response.body = JSON.stringify({ error: "Internal server error" })
          }
        } else {
          response.statusCode = 400
          response.body = JSON.stringify({
            error: "Missing required parameters",
          })
        }
        break
      case "DELETE /admin/delete_category":
        if (event.queryStringParameters && event.queryStringParameters.category_id) {
          const categoryId = event.queryStringParameters.category_id

          try {
            // Delete category query
            const deleteResult = await sqlConnectionTableCreator`
                DELETE FROM categories
                WHERE category_id = ${categoryId}
                RETURNING *; 
              `

            if (deleteResult.length === 0) {
              response.statusCode = 404
              response.body = JSON.stringify({ error: "Category not found" })
            } else {
              const userRole = "admin"
              const engagementType = "category deleted"

              // Log the category deletion in user engagement log
              await sqlConnectionTableCreator`
                  INSERT INTO user_engagement_log (log_id, session_id, timestamp, engagement_type, user_info, user_role)
                  VALUES (
                    uuid_generate_v4(),
                    NULL,
                    CURRENT_TIMESTAMP,
                    ${engagementType},
                    NULL,
                    ${userRole}
                  )
                `

              response.statusCode = 200
              response.body = JSON.stringify({
                message: "Category deleted successfully",
              })
            }
          } catch (err) {
            response.statusCode = 500
            console.error(err)
            response.body = JSON.stringify({ error: "Internal server error" })
          }
        } else {
          response.statusCode = 400
          response.body = JSON.stringify({
            error: "Missing required parameters",
          })
        }
        break
      case "PUT /admin/update_metadata":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.category_id &&
          event.queryStringParameters.document_name &&
          event.queryStringParameters.document_type
        ) {
          const categoryId = event.queryStringParameters.category_id
          const documentName = event.queryStringParameters.document_name
          const documentType = event.queryStringParameters.document_type
          const { metadata } = JSON.parse(event.body)

          try {
            // Query to find the document with the given category_id, document_name, and document_type
            const existingDocument = await sqlConnectionTableCreator`
        SELECT * FROM documents
        WHERE category_id = ${categoryId}
        AND document_name = ${documentName}
        AND document_type = ${documentType};
      `

            if (existingDocument.length === 0) {
              // If document does not exist, insert a new entry
              const result = await sqlConnectionTableCreator`
          INSERT INTO documents (document_id, category_id, document_s3_file_path, document_name, document_type, metadata, time_created)
          VALUES (uuid_generate_v4(), ${categoryId}, NULL, ${documentName}, ${documentType}, ${metadata}, CURRENT_TIMESTAMP)
          RETURNING *;
        `
              response.statusCode = 201
              response.body = JSON.stringify({
                message: "Document metadata added successfully",
                document: result[0],
              })
            } else {
              // Update the metadata field for an existing document
              const result = await sqlConnectionTableCreator`
          UPDATE documents
          SET metadata = ${metadata}
          WHERE category_id = ${categoryId}
          AND document_name = ${documentName}
          AND document_type = ${documentType}
          RETURNING *;
        `

              if (result.length > 0) {
                response.statusCode = 200
                response.body = JSON.stringify({
                  message: "Document metadata updated successfully",
                  document: result[0],
                })
              } else {
                response.statusCode = 500
                response.body = JSON.stringify({
                  error: "Failed to update metadata.",
                })
              }
            }
          } catch (err) {
            response.statusCode = 500
            console.error(err)
            response.body = JSON.stringify({ error: "Internal server error" })
          }
        } else {
          response.statusCode = 400
          response.body = JSON.stringify({
            error: "category_id, document_name, and document_type are required",
          })
        }
        break
      case "GET /admin/conversation_history_preview":
        try {
          const result = await sqlConnectionTableCreator`
              WITH RankedMessages AS (
                SELECT
                  uel.user_role,
                  uel.engagement_type,
                  uel.timestamp,
                  uel.user_info,
                  uel.engagement_details,
                  ROW_NUMBER() OVER (PARTITION BY uel.user_role ORDER BY uel.timestamp DESC) AS rn
                FROM user_engagement_log uel
                WHERE uel.engagement_type = 'message creation'
                  AND uel.user_role IN ('public', 'educator', 'admin', 'policy_maker', 'external_researcher')
              )
              SELECT user_role, engagement_type, timestamp, user_info, engagement_details
              FROM RankedMessages
              WHERE rn <= 10
              ORDER BY user_role, timestamp DESC;
            `

          const groupedResults = result.reduce((acc, row) => {
            if (!acc[row.user_role]) {
              acc[row.user_role] = []
            }
            acc[row.user_role].push(row)
            return acc
          }, {})

          response.body = JSON.stringify(groupedResults)
        } catch (err) {
          response.statusCode = 500
          console.error(err)
          response.body = JSON.stringify({ error: "Internal server error" })
        }
        break
        case "GET /admin/conversation_sessions":
          if (event.queryStringParameters && event.queryStringParameters.user_role) {
            const userRole = event.queryStringParameters.user_role;
            const startDate = event.queryStringParameters.start_date || null;
            const endDate = event.queryStringParameters.end_date || null;
            const page = parseInt(event.queryStringParameters.page) || 1;
            const limit = parseInt(event.queryStringParameters.limit) || 10;
            const offset = (page - 1) * limit;
        
            console.log(`Fetching sessions for user_role=${userRole}, start_date=${startDate}, end_date=${endDate}, page=${page}, limit=${limit}`);
        
            try {
              // Fetch the paginated sessions with LIMIT and OFFSET
              const sessions = await sqlConnectionTableCreator`
                WITH ranked_messages AS (
                  SELECT 
                    session_id,
                    engagement_details,
                    timestamp,
                    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp) as msg_order,
                    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp DESC) as reverse_order
                  FROM user_engagement_log
                  WHERE 
                    session_id IS NOT NULL
                    AND engagement_type = 'message creation'
                    AND user_role = ${userRole}
                    ${startDate ? sql`AND timestamp >= ${startDate}` : sql``}
                    ${endDate ? sql`AND timestamp <= ${endDate}` : sql``}
                ),
                second_messages AS (
                  SELECT 
                    session_id,
                    engagement_details as second_message_details
                  FROM ranked_messages
                  WHERE msg_order = 2
                ),
                latest_messages AS (
                  SELECT 
                    session_id,
                    timestamp as last_message_time
                  FROM ranked_messages
                  WHERE reverse_order = 1
                )
                SELECT 
                  lm.session_id,
                  lm.last_message_time,
                  sm.second_message_details
                FROM latest_messages lm
                LEFT JOIN second_messages sm ON lm.session_id = sm.session_id
                ORDER BY lm.last_message_time DESC
                LIMIT ${limit} OFFSET ${offset};
              `;
        
              // Separate query to count the total number of matching sessions (without fetching the data)
              const totalCount = await sqlConnectionTableCreator`
                WITH ranked_messages AS (
                  SELECT 
                    session_id
                  FROM user_engagement_log
                  WHERE 
                    session_id IS NOT NULL
                    AND engagement_type = 'message creation'
                    AND user_role = ${userRole}
                    ${startDate ? sql`AND timestamp >= ${startDate}` : sql``}
                    ${endDate ? sql`AND timestamp <= ${endDate}` : sql``}
                )
                SELECT COUNT(DISTINCT session_id) AS total_count
                FROM ranked_messages;
              `;
        
              // Calculate total pages based on totalCount
              const totalPages = Math.ceil(totalCount[0].total_count / limit);
        
              console.log(`Found ${totalCount[0].total_count} total sessions, with ${totalPages} pages.`);
        
              response.body = JSON.stringify({
                sessions,
                totalPages,
                currentPage: page,
                totalCount: totalCount[0].total_count,
              });
              response.statusCode = 200; // OK
            } catch (err) {
              console.error("Error fetching sessions:", err);
              response.statusCode = 500; // Internal Server Error
              response.body = JSON.stringify({ error: "Internal server error" });
            }
          } else {
            console.error("Missing required parameter: user_role");
            response.statusCode = 400; // Bad Request
            response.body = JSON.stringify({
              error: "Missing required parameter: user_role",
            });
          }
          break;
      case "GET /admin/previous_prompts":
        try {
          // Subquery to get the latest non-null time_created for each role
          const latestTimestamps = await sqlConnectionTableCreator`
      SELECT 
        MAX(time_created) FILTER (WHERE public IS NOT NULL) AS latest_public,
        MAX(time_created) FILTER (WHERE internal_researcher IS NOT NULL) AS latest_internal_researcher,
        MAX(time_created) FILTER (WHERE policy_maker IS NOT NULL) AS latest_policy_maker,
        MAX(time_created) FILTER (WHERE external_researcher IS NOT NULL) AS latest_external_researcher
      FROM prompts;
    `

          const { latest_public, latest_internal_researcher, latest_policy_maker, latest_external_researcher } = latestTimestamps[0]

          // Query to get all previous non-null entries for each role after the latest entry
          const previousPrompts = await sqlConnectionTableCreator`
      SELECT public, internal_researcher, policy_maker, external_researcher, time_created
      FROM prompts
      WHERE 
        (public IS NOT NULL AND time_created < ${latest_public}) OR
        (internal_researcher IS NOT NULL AND time_created < ${latest_internal_researcher}) OR
        (policy_maker IS NOT NULL AND time_created < ${latest_policy_maker}) OR
        (external_researcher IS NOT NULL AND time_created < ${latest_external_researcher})
      ORDER BY time_created DESC;
    `

          // Organize prompts by role and ignore null values
          const organizedPrompts = {
            public: previousPrompts
              .filter((entry) => entry.public !== null)
              .map((entry) => ({
                prompt: entry.public,
                time_created: entry.time_created,
              })),
            internal_researcher: previousPrompts
              .filter((entry) => entry.internal_researcher !== null)
              .map((entry) => ({
                prompt: entry.internal_researcher,
                time_created: entry.time_created,
              })),
            policy_maker: previousPrompts
              .filter((entry) => entry.policy_maker !== null)
              .map((entry) => ({
                prompt: entry.policy_maker,
                time_created: entry.time_created,
              })),
            external_researcher: previousPrompts
              .filter((entry) => entry.external_researcher !== null)
              .map((entry) => ({
                prompt: entry.external_researcher,
                time_created: entry.time_created,
              })),
          }

          // Return the organized prompts by role
          response.statusCode = 200
          response.body = JSON.stringify(organizedPrompts)
        } catch (err) {
          // Handle any errors that occur during the query
          response.statusCode = 500
          console.error(err)
          response.body = JSON.stringify({ error: "Internal server error" })
        }
        break
      case "POST /admin/insert_prompt":
        try {
          // Check if the required query parameter and body are provided
          if (!event.queryStringParameters || !event.queryStringParameters.role || !event.body) {
            response.statusCode = 400
            response.body = JSON.stringify({
              error: "Missing required parameters",
            })
            break
          }

          // Get role from query string and prompt from request body
          const role = event.queryStringParameters.role
          const { prompt } = JSON.parse(event.body)

          // Validate that role is one of the accepted roles
          if (!["public", "internal_researcher", "policy_maker", "external_researcher"].includes(role)) {
            response.statusCode = 400
            response.body = JSON.stringify({ error: "Invalid role provided" })
            break
          }

          // Prepare the prompt data with null values for other roles
          const promptData = {
            public: role === "public" ? prompt : null,
            internal_researcher: role === "internal_researcher" ? prompt : null,
            policy_maker: role === "policy_maker" ? prompt : null,
            external_researcher: role === "external_researcher" ? prompt : null,
            time_created: new Date(), // Current timestamp
          }

          // Insert into the prompts table
          await sqlConnectionTableCreator`
      INSERT INTO prompts (public, internal_researcher, policy_maker, external_researcher, time_created)
      VALUES (${promptData.public}, ${promptData.internal_researcher}, ${promptData.policy_maker}, ${promptData.external_researcher}, ${promptData.time_created});
    `

          // Return success response
          response.statusCode = 201
          response.body = JSON.stringify({
            message: "Prompt inserted successfully",
          })
        } catch (err) {
          // Handle any errors that occur during the insert
          response.statusCode = 500
          console.error(err)
          response.body = JSON.stringify({ error: "Internal server error" })
        }
        break
      case "GET /admin/get_feedback":
        try {
          if (!event.queryStringParameters || !event.queryStringParameters.session_id) {
            response.statusCode = 400
            response.body = JSON.stringify({
              error: "Missing required parameter: session_id",
            })
            break
          }

          const session_id = event.queryStringParameters.session_id
          const feedbackEntries = await sqlConnectionTableCreator`
        SELECT feedback_id, session_id, feedback_rating, feedback_description, timestamp
        FROM feedback
        WHERE session_id = ${session_id}
        ORDER BY timestamp DESC;
        `
          if (feedbackEntries.length === 0) {
            response.statusCode = 404
            response.body = JSON.stringify({
              error: "No feedback found for the given session_id",
            })
          } else {
            response.statusCode = 200
            response.body = JSON.stringify(feedbackEntries)
          }
        } catch (err) {
          response.statusCode = 500
          console.error(err)
          response.body = JSON.stringify({ error: "Internal server error" })
        }
        break
      case "GET /admin/feedback_by_role":
        if (event.queryStringParameters && event.queryStringParameters.user_role) {
          const userRole = event.queryStringParameters.user_role;
          const page = parseInt(event.queryStringParameters.page) || 1;
          const limit = parseInt(event.queryStringParameters.limit) || 10;
          const offset = (page - 1) * limit;

          console.log(`Fetching feedback for user_role=${userRole}, page=${page}, limit=${limit}`);

          try {
            // Fetch paginated feedback for the specified role
            const feedbackDetails = await sqlConnectionTableCreator`
              WITH feedback_with_roles AS (
                SELECT DISTINCT
                  f.feedback_id,
                  f.session_id,
                  f.feedback_rating,
                  f.feedback_description,
                  f.timestamp AS feedback_time,
                  uel.user_role
                FROM feedback f
                INNER JOIN user_engagement_log uel
                ON f.session_id = uel.session_id
                WHERE uel.user_role = ${userRole}
              )
              SELECT 
                feedback_id,
                session_id,
                feedback_rating,
                feedback_description,
                feedback_time
              FROM feedback_with_roles
              ORDER BY feedback_time DESC
              LIMIT ${limit} OFFSET ${offset};
            `;

            const totalCountResult = await sqlConnectionTableCreator`
              SELECT COUNT(*) AS total_count
              FROM (
                SELECT DISTINCT f.feedback_id
                FROM feedback f
                INNER JOIN user_engagement_log uel
                ON f.session_id = uel.session_id
                WHERE uel.user_role = ${userRole}
              ) AS count_table;
            `;

            const averageRatingResult = await sqlConnectionTableCreator`
              SELECT 
                AVG(f.feedback_rating) AS average_rating
              FROM feedback f
              INNER JOIN user_engagement_log uel
              ON f.session_id = uel.session_id
              WHERE uel.user_role = ${userRole};
            `;

            const totalCount = parseInt(totalCountResult[0].total_count, 10);
            const totalPages = Math.ceil(totalCount / limit);
            const averageRating = parseFloat(averageRatingResult[0].average_rating || 0).toFixed(1);

            response.body = JSON.stringify({
              user_role: userRole,
              feedback_count: totalCount,
              average_rating: averageRating,
              feedback_details: feedbackDetails,
              totalPages,
              currentPage: page,
            });
            response.statusCode = 200;
          } catch (err) {
            console.error("Error fetching feedback:", err);
            response.statusCode = 500;
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          console.error("Missing required parameter: user_role");
          response.statusCode = 400;
          response.body = JSON.stringify({ error: "Missing required parameter: user_role" });
        }
        break;
      default:
        throw new Error(`Unsupported route: "${pathData}"`)
    }
  } catch (error) {
    response.statusCode = 400
    console.log(error)
    response.body = JSON.stringify(error.message)
  }
  console.log(response)
  return response
}

