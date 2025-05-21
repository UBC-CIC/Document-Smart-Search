/**
 * Services for handling chat API interactions
 */

// Create a new chat session
export async function createChatSession(fingerprint) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/create_session?user_info=${encodeURIComponent(
        fingerprint
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const sessionDataJson = await response.json();
    const sessionData = sessionDataJson[0].session_id;
    return sessionData;
  } catch (error) {
    console.error("Error creating session:", error);
    throw error;
  }
}

// Fetch chat history for a session
export async function fetchChatMessages(sessionId) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/get_messages?session_id=${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching messages:", error);
    throw error;
  }
}

// Send a message to the chat API
export async function sendChatMessage(session, fingerprint, content, userRole) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/text_generation?session_id=${encodeURIComponent(
        session
      )}&user_info=${encodeURIComponent(fingerprint)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message_content: content,
          user_role: userRole || "public",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}

// Send feedback about the chat
export async function submitFeedback(fingerprint, session, userRole, rating, description) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}/user/create_feedback?user_info=${encodeURIComponent(
        fingerprint
      )}&session_id=${encodeURIComponent(session)}&user_role=${encodeURIComponent(
        userRole
      )}&feedback_rating=${encodeURIComponent(
        rating
      )}&feedback_description=${encodeURIComponent(description)}`,
      { method: "POST" }
    );

    if (!response.ok) {
      throw new Error("Failed to submit feedback");
    }

    return await response.json();
  } catch (error) {
    console.error("Error submitting feedback:", error);
    throw error;
  }
}
