-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "repetitionFrequency" TEXT NOT NULL DEFAULT 'daily',
    "customSchedule" TEXT,
    "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 60,
    "preferredTime" TEXT NOT NULL DEFAULT '18:00',
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Module_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RawNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RawNote_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Technique" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "whenToUse" TEXT NOT NULL,
    "howToUse" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Technique_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IfThenPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "techniqueId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IfThenPattern_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "Technique" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "techniqueId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'beginner',
    "totalReps" INTEGER NOT NULL DEFAULT 0,
    "avgScore" REAL NOT NULL DEFAULT 0,
    "bestScore" REAL NOT NULL DEFAULT 0,
    "lastScore" REAL NOT NULL DEFAULT 0,
    "consecutiveHighScores" INTEGER NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "lastPracticedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SkillProgress_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "Technique" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepetitionCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "techniqueId" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepetitionCard_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "Technique" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "companySize" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "currentSolution" TEXT,
    "painPoints" TEXT,
    "objections" TEXT,
    "avatarUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "sessionType" TEXT NOT NULL DEFAULT 'mixed',
    CONSTRAINT "PracticeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "techniqueId" TEXT NOT NULL,
    "exerciseType" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "userResponse" TEXT NOT NULL,
    "aiEvaluation" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExerciseAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseAttempt_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "Technique" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoleplaySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "meetingType" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "focusTechnique" TEXT,
    "transcript" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RoleplaySession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoleplaySession_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scorecard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleplayId" TEXT NOT NULL,
    "rightTechniqueScore" INTEGER NOT NULL DEFAULT 0,
    "frameworkCoverage" INTEGER NOT NULL DEFAULT 0,
    "objectionHandling" INTEGER NOT NULL DEFAULT 0,
    "meetingStructure" INTEGER NOT NULL DEFAULT 0,
    "naturalFormulation" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "detailedFeedback" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Scorecard_roleplayId_fkey" FOREIGN KEY ("roleplayId") REFERENCES "RoleplaySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimestampedFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleplayId" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "buyerSaid" TEXT NOT NULL,
    "userSaid" TEXT NOT NULL,
    "techniqueName" TEXT NOT NULL,
    "idealResponse" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "TimestampedFeedback_roleplayId_fkey" FOREIGN KEY ("roleplayId") REFERENCES "RoleplaySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RealMeetingAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meetingType" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "summary" TEXT,
    "talkRatio" REAL,
    "questionsAsked" INTEGER,
    "longestMonologue" INTEGER,
    "techniqueHits" TEXT,
    "techniqueMisses" TEXT,
    CONSTRAINT "RealMeetingAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingFeedbackItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "techniqueName" TEXT NOT NULL,
    "whatHappened" TEXT NOT NULL,
    "suggestion" TEXT,
    "quote" TEXT,
    CONSTRAINT "MeetingFeedbackItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "RealMeetingAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedExercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "exerciseType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "techniqueName" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedExercise_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "RealMeetingAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReflectionEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "meetingId" TEXT,
    "question1" TEXT NOT NULL,
    "question2" TEXT NOT NULL,
    "question3" TEXT NOT NULL,
    "question4" TEXT NOT NULL,
    "question5" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReflectionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReflectionEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReflectionEntry_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "RealMeetingAnalysis" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'trophy',
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyStreak" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "minutesSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillProgress_techniqueId_key" ON "SkillProgress"("techniqueId");

-- CreateIndex
CREATE UNIQUE INDEX "RepetitionCard_techniqueId_key" ON "RepetitionCard"("techniqueId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleplaySession_sessionId_key" ON "RoleplaySession"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_roleplayId_key" ON "Scorecard"("roleplayId");

-- CreateIndex
CREATE UNIQUE INDEX "ReflectionEntry_sessionId_key" ON "ReflectionEntry"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReflectionEntry_meetingId_key" ON "ReflectionEntry"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStreak_userId_date_key" ON "DailyStreak"("userId", "date");
