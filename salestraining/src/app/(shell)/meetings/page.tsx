import { getUserMeetings } from "@/actions/meetings";
import { MeetingsClient } from "@/components/meetings/meetings-client";

const USER_ID = "default-user";

export default async function MeetingsPage() {
  const meetings = await getUserMeetings(USER_ID);
  return <MeetingsClient meetings={meetings} />;
}
