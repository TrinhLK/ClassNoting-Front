import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminAuth } from '@/app/lib/firebase-admin';
import { checkRateLimit } from '@/app/lib/rate-limit';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const formatDeadline = (isoString: string) => {
    if (!isoString || isoString === 'TBD' || isoString === 'Chưa rõ') return isoString;
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        return date.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return isoString;
    }
};

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let authUser;
    try {
      authUser = await getAdminAuth().verifyIdToken(idToken);
    } catch (error) {
      console.error("Auth verification failed:", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit SAU auth để tránh DoS qua token giả (per-user, không per-IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`email:${authUser.uid}`, 10, 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { tasks, meetingTitle } = await req.json();

    const tasksByEmail: Record<string, any[]> = {};
    tasks.forEach((task: any) => {
      if (task.email && Array.isArray(task.email)) {
          task.email.forEach((email: string) => {
              if (!tasksByEmail[email]) tasksByEmail[email] = [];
              tasksByEmail[email].push(task);
          });
      }
    });

    const sendPromises = Object.keys(tasksByEmail).map(async (email) => {
      const userTasks = tasksByEmail[email];
      
      const taskListHtml = userTasks.map((t: any, index: number) => `
        <div style="margin-bottom: 15px; padding: 10px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #4f46e5;">
          <div style="font-weight: bold; color: #1f2937; margin-bottom: 4px;">
             📌 Nhiệm vụ ${index + 1}: ${t.task}
          </div>
          <div style="font-size: 14px; color: #ef4444;">
             ⏰ Hạn chót: <b>${formatDeadline(t.deadline)}</b>
          </div>
        </div>
      `).join('');

      const unsubscribeUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(email)}`;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4f46e5;">Phân công công việc mới</h2>
            
            <p>Xin chào,</p>
            <p>Bạn vừa được giao <b>${userTasks.length} nhiệm vụ</b> từ cuộc họp:</p>
            
            <div style="background-color: #e0e7ff; color: #3730a3; padding: 10px 15px; border-radius: 6px; font-weight: bold; margin-bottom: 20px;">
                📅 ${meetingTitle || "Cuộc họp không tên"}
            </div>

            ${taskListHtml}
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;"/>
            <p style="font-size: 12px; color: #666; text-align: center;">
                Email tự động từ AI Task Manager.
                <a href="${unsubscribeUrl}" style="color: #4f46e5;">Hủy đăng ký nhận email</a>
            </p>
        </div>
      `;

      return transporter.sendMail({
        from: '"AI Task Manager" <no-reply@taskmanager.com>',
        to: email,
        subject: `[Task Mới] ${meetingTitle} - Bạn có ${userTasks.length} việc cần làm`,
        html: htmlContent,
      });
    });

    const results = await Promise.allSettled(sendPromises);
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`Email failures: ${failures.length}/${results.length}`);
      failures.forEach((f, i) => {
        const reason = (f as PromiseRejectedResult).reason;
        console.error(`  [${i + 1}] ${reason?.message || reason}`);
      });
    }

    return NextResponse.json({
      success: true,
      count: Object.keys(tasksByEmail).length,
      failures: failures.length
    });

  } catch (error) {
    console.error("Lỗi gửi mail:", error);
    return NextResponse.json({ error: "Lỗi gửi mail" }, { status: 500 });
  }
}