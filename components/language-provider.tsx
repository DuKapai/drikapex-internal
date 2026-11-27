"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

export type Language = "vi" | "en";

const translations: Record<string, string> = {
  "Access unavailable": "Không thể truy cập",
  "ACCESS ENFORCED BY SUPABASE RLS": "QUYỀN TRUY CẬP ĐƯỢC THỰC THI BỞI SUPABASE RLS",
  "Add a category in the existing database before creating documents.": "Hãy thêm danh mục vào cơ sở dữ liệu trước khi tạo văn bản.",
  "Apply and verify the database RLS policies before accessing this workspace.": "Hãy áp dụng và xác minh chính sách RLS của cơ sở dữ liệu trước khi truy cập không gian làm việc.",
  "Apply and verify the database RLS policies before loading employee data.": "Hãy áp dụng và xác minh chính sách RLS trước khi tải dữ liệu nhân sự.",
  "Apply and verify the RLS policies before enabling dashboard access.": "Hãy áp dụng và xác minh chính sách RLS trước khi bật quyền truy cập bảng điều khiển.",
  "Add and verify RLS policies before accessing the dashboard.": "Hãy thêm và xác minh chính sách RLS trước khi truy cập bảng điều khiển.",
  "Add the Supabase public URL and publishable/anon key to .env.local.": "Hãy thêm URL Supabase và publishable/anon key vào .env.local.",
  "Add the Supabase public URL and publishable/anon key to .env.local, then restart the app.": "Hãy thêm URL Supabase và publishable/anon key vào .env.local, sau đó khởi động lại ứng dụng.",
  "ADMIN": "Quản trị viên",
  "Are you sure you want to delete this? This cannot be undone.": "Bạn có chắc muốn xóa mục này? Thao tác này không thể hoàn tác.",
  "Checking your active profile and account role.": "Đang kiểm tra hồ sơ và vai trò của bạn.",
  "Checking your active employee profile and office access.": "Đang kiểm tra hồ sơ nhân sự và quyền truy cập văn phòng.",
  "DRIKAPEX · DIGITAL HEADQUARTERS": "DRIKAPEX · TRỤ SỞ SỐ",
  "DRIKAPEX INTERNAL": "DRIKAPEX NỘI BỘ",
  "Enter your work email and we’ll send a reset link if the account can receive email.": "Nhập email công việc để nhận liên kết đặt lại mật khẩu nếu tài khoản có thể nhận thư.",
  "Enter your work email to request a PIN from the owner.": "Nhập email công việc để yêu cầu Owner cung cấp mã PIN.",
  "Enter your PIN.": "Nhập mã PIN.",
  "If your account is eligible, the owner will receive a PIN. Ask them for the four-digit code.": "Nếu tài khoản hợp lệ, yêu cầu đã được gửi tới Owner. Giữ trang này mở và xin mã gồm 4 chữ số. Mã hết hạn sau 10 phút; tối đa 5 lần thử trong 30 phút.",
  "Password update could not be confirmed. Try signing in with the new password before requesting a new PIN.": "Không xác nhận được việc đổi mật khẩu. Hãy thử đăng nhập bằng mật khẩu mới trước khi yêu cầu mã PIN khác.",
  "Four-digit PIN": "Mã PIN 4 chữ số",
  "PIN digit": "Chữ số PIN",
  "Enter the four-digit PIN.": "Vui lòng nhập đủ 4 chữ số PIN.",
  "Request PIN": "Gửi yêu cầu mã PIN",
  "If your account is eligible, a PIN has been sent to the owner. Keep this page open and contact the owner for the four-digit code. It is single-use, expires within 30 minutes, and allows at most five attempts.": "Nếu tài khoản hợp lệ, mã PIN đã được gửi tới Owner. Giữ trang này mở và liên hệ Owner để nhận mã 4 chữ số. Mã dùng một lần, hết hạn trong tối đa 30 phút và cho phép tối đa 5 lần nhập.",
  "Password recovery requests": "Yêu cầu khôi phục mật khẩu",
  "Verify the employee's identity before issuing a PIN. Share the code privately, never their new password.": "Xác minh danh tính nhân sự trước khi cấp PIN. Gửi mã riêng cho nhân sự; không yêu cầu họ cung cấp mật khẩu mới.",
  "No pending password recovery requests.": "Không có yêu cầu khôi phục mật khẩu đang chờ.",
  "Single-use PIN. Valid for 10 minutes. It cannot be viewed again after leaving this page.": "PIN dùng một lần, có hiệu lực 10 phút. Rời trang này sẽ không thể xem lại mã.",
  "Hide PIN": "Ẩn mã PIN",
  "PIN issued. Waiting for the employee.": "Đã cấp PIN. Đang chờ nhân sự xác nhận.",
  "PIN sent to the owner's email. Waiting for the employee.": "Đã gửi PIN tới email Owner. Đang chờ nhân sự nhập mã.",
  "Issue PIN": "Cấp mã PIN",
  "Confirm employee identity": "Xác minh danh tính nhân sự",
  "Only issue a PIN after independently confirming who requested it.": "Chỉ cấp PIN sau khi xác nhận đúng nhân sự yêu cầu qua kênh liên hệ riêng.",
  "Identity verified — issue PIN": "Đã xác minh — cấp PIN",
  "Sign in with an active owner account to manage PIN requests.": "Cần đăng nhập bằng tài khoản Owner đang hoạt động để quản lý yêu cầu PIN.",
  "This request expired or its PIN was already issued. Refresh the list.": "Yêu cầu đã hết hạn hoặc đã được cấp PIN. Hãy làm mới danh sách.",
  "PIN issuance could not be confirmed. Refresh the list before trying again.": "Chưa xác nhận được việc cấp PIN. Hãy làm mới danh sách trước khi thử lại.",
  "Verify PIN": "Xác nhận mã PIN",
  "Verifying…": "Đang xác nhận…",
  "Contact the owner to verify your identity and receive your PIN.": "Hãy liên hệ Owner để xác minh danh tính và nhận mã PIN.",
  "Too many recovery attempts. Please wait before trying again.": "Bạn đã thử quá nhiều lần. Vui lòng đợi trước khi thử lại.",
  "Please wait for the timer to end before requesting another PIN.": "Vui lòng chờ hết thời gian đếm ngược rồi mới yêu cầu mã PIN mới.",
  "A PIN was already requested for this email. Enter it below, or resend when the timer ends.": "Email này đã có yêu cầu mã PIN đang chờ. Hãy nhập mã Owner cung cấp bên dưới, hoặc gửi lại khi hết thời gian đếm ngược.",
  "A new PIN has been sent to the owner. Earlier PINs no longer work.": "Đã gửi mã PIN mới tới Owner. Các mã PIN trước đó không còn hiệu lực.",
  "Request again in": "Gửi lại yêu cầu sau",
  "I already have a PIN": "Tôi đã có mã PIN",
  "Didn't receive a PIN?": "Chưa nhận được mã?",
  "Resend PIN in": "Gửi lại mã PIN sau",
  "Resend PIN": "Gửi lại mã PIN",
  "The PIN is incorrect, expired, or has reached the attempt limit.": "Mã PIN không đúng, đã hết hạn hoặc đã hết số lần thử.",
  "The recovery session expired. Request a new PIN.": "Phiên khôi phục đã hết hạn. Hãy yêu cầu mã PIN mới.",
  "Password recovery is unavailable. Contact the administrator.": "Chức năng khôi phục mật khẩu chưa sẵn sàng. Hãy liên hệ quản trị viên.",
  "PIN recovery is not deployed to Supabase yet. Contact the administrator.": "Chức năng PIN chưa được triển khai lên Supabase. Hiện tại chưa thể gửi yêu cầu mã PIN; hãy liên hệ quản trị viên.",
  "PIN recovery is deployed but not configured yet. Contact the administrator.": "Chức năng PIN đã triển khai nhưng chưa được cấu hình đầy đủ. Hãy liên hệ quản trị viên.",
  "Password recovery returned an invalid response.": "Không nhận được phản hồi hợp lệ từ chức năng khôi phục mật khẩu.",
  "Password update could not be confirmed. Request a new PIN.": "Không thể xác nhận việc đổi mật khẩu. Hãy yêu cầu mã PIN mới.",
  "Password changed, but the session could not be closed. Sign out before signing in again.": "Đã đổi mật khẩu nhưng chưa thể đóng phiên. Hãy đăng xuất trước khi đăng nhập lại.",
  "Password updated. Sign in with your new password.": "Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.",
  "If you can’t access your mailbox or don’t receive a reset email, contact your system administrator to reset your password.": "Nếu không truy cập được hộp thư hoặc không nhận được thư đặt lại, hãy liên hệ quản trị viên hệ thống để đổi mật khẩu.",
  "If this account can receive email, a password reset link has been sent. If you cannot access its mailbox, contact your administrator.": "Nếu tài khoản có thể nhận email, liên kết đặt lại mật khẩu đã được gửi. Nếu bạn không truy cập được hộp thư, hãy liên hệ quản trị viên.",
  "Interactive 3D office floor plan": "Mặt bằng văn phòng 3D tương tác",
  "Interactive roofless 3D office map": "Bản đồ văn phòng 3D không mái, có thể tương tác",
  "Password updated. Opening your workspace…": "Đã cập nhật mật khẩu. Đang mở không gian làm việc…",
  "ROOFTOP VIEW · INTERACTIVE FLOOR PLAN": "GÓC NHÌN TỪ TRÊN · MẶT BẰNG TƯƠNG TÁC",
  "Sign in with your existing Drikapex account. Your role will open the administration dashboard or the virtual office.": "Đăng nhập bằng tài khoản Drikapex hiện có. Vai trò sẽ đưa bạn đến bảng điều khiển quản trị hoặc văn phòng ảo.",
  "Switch to dark mode": "Bật giao diện tối",
  "Switch to light mode": "Bật giao diện sáng",
  "Update password": "Cập nhật mật khẩu",
  "Verifying access…": "Đang xác minh quyền truy cập…",
  "Verifying your active employee profile and office access.": "Đang xác minh hồ sơ nhân sự và quyền truy cập văn phòng.",
  "Account deletion": "Xóa tài khoản",
  "Account deleted, but the audit log was not confirmed.": "Đã xóa tài khoản nhưng chưa xác nhận được nhật ký hoạt động.",
  "Account deleted under the ADMIN-approved request.": "Đã xóa tài khoản theo yêu cầu được ADMIN phê duyệt.",
  "Account deletion rejected.": "Đã từ chối yêu cầu xóa tài khoản.",
  "Account deletion request": "Yêu cầu xóa tài khoản",
  "Account deletion requests · ": "Yêu cầu xóa tài khoản · ",
  "Account was deleted, but the audit event was not confirmed.": "Đã xóa tài khoản nhưng chưa xác nhận được sự kiện nhật ký.",
  "Accounts": "Tài khoản",
  "Accounts and access": "Tài khoản và quyền truy cập",
  "Accounts · access": "Tài khoản · quyền truy cập",
  "Active": "Đang hoạt động",
  "Online": "Trực tuyến",
  "online": "đang trực tuyến",
  "Status unavailable": "Chưa xác định trạng thái",
  "Online status could not be updated.": "Không thể cập nhật trạng thái trực tuyến.",
  "Active profiles; online status reflects recent connections.": "Hồ sơ đang hoạt động; trạng thái trực tuyến phản ánh kết nối gần đây.",
  "Simulated profiles": "Nhân vật mô phỏng",
  "Administration": "Quản trị",
  "ADMIN · APPROVALS": "ADMIN · PHÊ DUYỆT",
  "Automatic": "Tự động",
  "At the cafe": "Đang ở quán cà phê",
  "At the restroom": "Đang ở nhà vệ sinh",
  "At their desk": "Đang làm việc tại bàn",
  "Automatic mode": "Chế độ tự động",
  "Relaxing": "Đang thư giãn",
  "Calling shipper": "Đang gọi cho shipper",
  "Waiting for shipper": "Đang chờ shipper",
  "Receiving a delivery": "Đang nhận hàng",
  "Storing a delivery": "Đang cất hàng",
  "Participating in a team meeting": "Đang tham gia cuộc họp",
  "Calling the courier": "Đang gọi cho shipper",
  "Waiting for the courier": "Đang chờ shipper",
  "Receiving an online order": "Đang nhận đơn hàng trực tuyến",
  "Returning to store the delivery": "Đang quay lại cất hàng",
  "Using the restroom": "Đang sử dụng nhà vệ sinh",
  "Sleeping at the desk": "Đang ngủ tại bàn làm việc",
  "Taking a break at the cafe": "Đang nghỉ tại quán cà phê",
  "Relaxing with colleagues": "Đang thư giãn cùng đồng nghiệp",
  "Working at the desk": "Đang làm việc tại bàn",
  "Working in administration": "Đang làm việc tại khu hành chính",
  "Working in executive": "Đang làm việc tại khu điều hành",
  "Working in documents": "Đang làm việc tại khu tài liệu",
  "Walking to the restroom": "Đang đi đến nhà vệ sinh",
  "Walking between work areas": "Đang di chuyển giữa các khu vực",
  "Reporting to the manager": "Đang báo cáo với quản lý",
  "Automatic behavior resumed": "Đã tiếp tục hoạt động tự động",
  "Working in personal office": "Đang làm việc tại văn phòng cá nhân",
  "Joining the meeting room": "Đang đến phòng họp",
  "Starting a team meeting": "Đang bắt đầu cuộc họp nhóm",
  "Going to the restroom": "Đang đi đến nhà vệ sinh",
  "Team meeting started": "Cuộc họp nhóm đã bắt đầu",
  "Team meeting ended": "Cuộc họp nhóm đã kết thúc",
  "Manual control expired; automatic behavior resumed": "Điều khiển thủ công hết hạn; đã tiếp tục hoạt động tự động",
  "Office live-control database setup is missing. Apply supabase/office-realtime.sql in your Supabase project.": "Chưa thiết lập cơ sở dữ liệu điều khiển văn phòng. Hãy chạy supabase/office-realtime.sql trong dự án Supabase.",
  "Your account cannot access office controls. Verify the active profile and Supabase permissions.": "Tài khoản không thể truy cập điều khiển văn phòng. Hãy kiểm tra hồ sơ đang hoạt động và quyền Supabase.",
  "Supabase could not be reached. Check the project URL and your network connection.": "Không thể kết nối Supabase. Hãy kiểm tra URL dự án và kết nối mạng.",
  "Office controls could not connect to Supabase. Check your connection and try again.": "Không thể kết nối điều khiển văn phòng với Supabase. Hãy kiểm tra kết nối và thử lại.",
  "Office controls could not connect to Supabase. Check your access and try again.": "Không thể kết nối điều khiển văn phòng với Supabase. Hãy kiểm tra quyền truy cập và thử lại.",
  "Supabase public configuration is missing or invalid. Check NEXT_PUBLIC_SUPABASE_URL and the publishable or anon key.": "Cấu hình Supabase công khai đang thiếu hoặc không hợp lệ. Hãy kiểm tra NEXT_PUBLIC_SUPABASE_URL và publishable key hoặc anon key.",
  "Live office synchronization is unavailable. Check that the office tables are enabled in Supabase Realtime.": "Đồng bộ văn phòng trực tiếp không khả dụng. Hãy kiểm tra các bảng văn phòng đã được bật trong Supabase Realtime.",
  "Are you sure you want to approve deletion of": "Bạn có chắc muốn duyệt xóa tài khoản",
  "Are you sure you want to reject deletion of": "Bạn có chắc muốn từ chối xóa tài khoản",
  "Audit log": "Nhật ký hoạt động",
  "Audit trail": "Lịch sử hoạt động",
  "Back to sign in": "Quay lại đăng nhập",
  "Back to homepage": "Về trang chủ",
  "WORKSPACE DEVICE REQUIREMENT": "YÊU CẦU THIẾT BỊ LÀM VIỆC",
  "Supported devices": "Thiết bị được hỗ trợ",
  "PC or laptop": "PC hoặc laptop",
  "Tablet": "Máy tính bảng",
  "Work from a PC or tablet.": "Hãy sử dụng PC hoặc máy tính bảng để làm việc.",
  "The internal workspace is available on PCs, laptops and tablets. Please open this page on one of these devices to continue.": "Không gian làm việc nội bộ hỗ trợ PC, laptop và máy tính bảng. Hãy mở trang này trên một trong các thiết bị đó để tiếp tục.",
  "Back to the office floor": "Quay lại khu vực văn phòng",
  "Boardroom": "Phòng họp",
  "Men's restroom": "Nhà vệ sinh nam",
  "Women's restroom": "Nhà vệ sinh nữ",
  "Restrooms": "Nhà vệ sinh nam và nữ",
  "Browse": "Duyệt",
  "Choose a password with at least 8 characters.": "Mật khẩu cần có ít nhất 8 ký tự.",
  "Communication": "Khu giao tiếp",
  "Complete": "Hoàn tất",
  "Confirm new password": "Xác nhận mật khẩu mới",
  "Contact": "Liên hệ",
  "CONTROL CENTER": "TRUNG TÂM QUẢN TRỊ",
  "Creating Auth users, disabling access, assigning roles, and resetting passwords are not done in the browser. The schema requires a protected Supabase Edge Function with server-side authorization.": "Không thể tạo tài khoản Auth, vô hiệu hóa quyền truy cập, gán vai trò hoặc đặt lại mật khẩu trực tiếp trên trình duyệt. Các thao tác này cần Supabase Edge Function được bảo vệ và xác thực ở phía máy chủ.",
  "Dashboard navigation": "Điều hướng bảng điều khiển",
  "Data": "Dữ liệu",
  "Delete account": "Xóa tài khoản",
  "Document": "Văn bản",
  "Document code": "Mã văn bản",
  "Document center": "Trung tâm văn bản",
  "Go to personal office": "Về phòng làm việc cá nhân",
  "Hold position": "Giữ nguyên vị trí",
  "Employee code": "Mã nhân viên",
  "Explore spaces": "Khám phá các khu vực",
  "Filter": "Bộ lọc",
  "Full name": "Họ và tên",
  "INTERNAL": "NỘI BỘ",
  "Inactive": "Ngừng hoạt động",
  "New password": "Mật khẩu mới",
  "Join meeting": "Vào phòng họp",
  "No role is assigned to this account. Contact your administrator.": "Tài khoản chưa được gán vai trò. Vui lòng liên hệ quản trị viên.",
  "No public registration. Workspace access is assigned to existing Supabase accounts by role.": "Không hỗ trợ tự đăng ký. Quyền truy cập được cấp theo vai trò cho các tài khoản Supabase hiện có.",
  "Notification": "Thông báo",
  "Notifications": "Thông báo",
  "Office floor": "Mặt bằng văn phòng",
  "Office activity": "Hoạt động văn phòng",
  "OFFICE STATUS": "TRẠNG THÁI VĂN PHÒNG",
  "Office unavailable": "Không thể mở văn phòng",
  "Only ADMIN can delete user accounts.": "Chỉ ADMIN mới có quyền xóa tài khoản người dùng.",
  "Password": "Mật khẩu",
  "People": "Nhân sự",
  "People & culture": "Nhân sự và văn hóa",
  "People & culture café": "Nhân sự, văn hóa và café",
  "Personnel · Lunch & recharge": "Nhân sự · Ăn uống và thư giãn",
  "Personnel": "Nhân sự",
  "Refresh": "Tải lại",
  "Refreshing…": "Đang tải lại…",
  "Reception": "Quầy lễ tân",
  "Reception lounge": "Sảnh tiếp khách",
  "Restroom": "Nhà vệ sinh",
  "Recent activity": "Hoạt động gần đây",
  "Report to Dung": "Đến báo cáo với Dung",
  "Resume automatic": "Chuyển về tự động",
  "returns to automatic in": "sẽ tự động chuyển sau",
  "Manual control": "Đang điều khiển thủ công",
  "No shared activity has been recorded yet.": "Chưa có hoạt động dùng chung nào được ghi nhận.",
  "PERSONAL CONTROLS": "ĐIỀU KHIỂN CÁ NHÂN",
  "Your office mode": "Chế độ văn phòng của bạn",
  "Offline": "Ngoại tuyến",
  "Live": "Trực tuyến",
  "Connecting": "Đang kết nối",
  "LIVE STATUS": "TRẠNG THÁI TRỰC TIẾP",
  "Personal controls": "Điều khiển cá nhân",
  "Fullscreen": "Toàn màn hình",
  "Exit fullscreen": "Thoát toàn màn hình",
  "Could not change fullscreen mode.": "Không thể thay đổi chế độ toàn màn hình.",
  "Fullscreen is not supported in this browser.": "Trình duyệt này không hỗ trợ chế độ toàn màn hình.",
  "Visit cafe": "Đến quán cà phê",
  "Visit restroom": "Đến nhà vệ sinh",
  "Start team meeting": "Bắt đầu cuộc họp",
  "Call a bird flyby": "Gọi chim bay",
  "Call a regular motorcycle": "Gọi xe mô tô thường",
  "Call a tuned motorcycle with police": "Gọi mô tô độ có công an đuổi",
  "Called a bird flyby": "Đã gọi chim bay",
  "Called a regular motorcycle": "Đã gọi xe mô tô thường",
  "Called a tuned motorcycle with police": "Đã gọi mô tô độ có công an đuổi",
  "LOCAL ONLY": "CHỈ TRÊN THIẾT BỊ NÀY",
  "PERSONAL MOVEMENT": "ĐIỀU KHIỂN CÁ NHÂN",
  "SCENE EFFECTS": "HIỆU ỨNG CẢNH",
  "Recent local actions": "Thao tác gần đây",
  "THIS DEVICE": "THIẾT BỊ NÀY",
  "No local actions yet.": "Chưa có thao tác nào.",
  "This panel controls the office on this device only. No database connection is required.": "Bảng điều khiển chỉ tác động lên văn phòng trên thiết bị này, không cần kết nối cơ sở dữ liệu.",
  "Team meeting in progress": "Cuộc họp toàn văn phòng đang diễn ra",
  "The meeting will continue. Personal movement is paused until it ends.": "Cuộc họp vẫn tiếp tục. Điều khiển di chuyển cá nhân tạm dừng đến khi cuộc họp kết thúc.",
  "No reachable office destination is available for this control.": "Không tìm thấy lộ trình khả dụng đến vị trí được chọn.",
  "Walking": "Đang di chuyển",
  "Working": "Đang làm việc",
  "In a meeting": "Đang họp",
  "Resting": "Đang nghỉ ngơi",
  "Reporting to Dung": "Đang báo cáo với Dung",
  "Holding position": "Đang giữ nguyên vị trí",
  "Meeting started": "Cuộc họp đã bắt đầu",
  "Meeting ended": "Cuộc họp đã kết thúc",
  "Staff facilities": "Khu tiện ích nhân viên",
  "Reject deletion of": "từ chối xóa tài khoản",
  "Request rejected.": "Đã từ chối yêu cầu.",
  "REQUEST STATUS": "TRẠNG THÁI YÊU CẦU",
  "Role": "Vai trò",
  "Role hierarchy and database RLS remain authoritative.": "Thứ bậc vai trò và chính sách RLS của cơ sở dữ liệu luôn có hiệu lực.",
  "Role verified": "Đã xác thực vai trò",
  "Roles & permissions": "Vai trò và quyền",
  "Roles · permissions · ROLE_PERMISSIONS": "Vai trò · quyền · ROLE_PERMISSIONS",
  "Save status": "Lưu trạng thái",
  "Sign out": "Đăng xuất",
  "Submit": "Gửi",
  "Suspended": "Tạm ngưng",
  "System administration": "Quản trị hệ thống",
  "The server did not confirm the deletion request.": "Máy chủ chưa xác nhận yêu cầu xóa.",
  "The server did not confirm account deletion.": "Máy chủ chưa xác nhận việc xóa tài khoản.",
  "The server did not confirm the review decision.": "Máy chủ chưa xác nhận kết quả duyệt.",
  "The requesting manager can now execute the deletion.": "Quản lý đã gửi yêu cầu hiện có thể tiến hành xóa.",
  "The passwords do not match.": "Mật khẩu xác nhận không khớp.",
  "This account has no active Drikapex profile. Contact your administrator.": "Tài khoản chưa có hồ sơ Drikapex đang hoạt động. Vui lòng liên hệ quản trị viên.",
  "This account has no assigned access level. Contact an administrator.": "Tài khoản chưa được cấp quyền truy cập. Vui lòng liên hệ quản trị viên.",
  "Updates & notices": "Tin tức và thông báo",
  "Users · profiles · user_roles": "Người dùng · hồ sơ · user_roles",
  "VIRTUAL OFFICE": "VĂN PHÒNG ẢO",
  "Virtual office": "Văn phòng ảo",
  "Welcome": "Chào mừng",
  "Welcome, ": "Chào mừng, ",
  "YOUR DIGITAL WORKPLACE · FLOOR 01": "KHÔNG GIAN LÀM VIỆC SỐ · TẦNG 01",
  "YOUR WORKPLACE": "NƠI LÀM VIỆC CỦA BẠN",
  "Your account does not have permission for this dashboard section.": "Tài khoản của bạn không có quyền truy cập mục này.",
  "Your role controls what you can access": "Vai trò của bạn quyết định quyền truy cập",
  "Your role cannot review this account.": "Vai trò của bạn không thể quản lý tài khoản này.",
  "Your role cannot access this information.": "Vai trò của bạn không có quyền truy cập thông tin này.",
  "characters represent active account profiles. Their motion is illustrative; access remains controlled by Supabase.": "Nhân vật đại diện cho hồ sơ đang hoạt động. Chuyển động chỉ mang tính minh họa; quyền truy cập vẫn do Supabase kiểm soát.",
  "Employee records from the existing personnel directory.": "Hồ sơ nhân sự từ danh bạ hiện có.",
  "Read-only history from the existing audit_logs table. Trusted event creation must run in a database trigger or protected backend.": "Lịch sử chỉ đọc từ bảng audit_logs hiện có. Việc ghi nhật ký tin cậy phải thực hiện bằng database trigger hoặc backend được bảo vệ.",
  "No records are visible to your account.": "Tài khoản của bạn chưa có dữ liệu hiển thị.",
  "No records were returned for this account.": "Không tìm thấy dữ liệu cho tài khoản này.",
  "Loading database records…": "Đang tải dữ liệu…",
  "Loading Supabase records…": "Đang tải dữ liệu Supabase…",
  "Your account does not have the permission required for this module. Ask an administrator to assign the appropriate role. Database RLS remains the authoritative access control.": "Tài khoản chưa có quyền cần thiết cho phân hệ này. Hãy liên hệ quản trị viên để được gán vai trò phù hợp. RLS của cơ sở dữ liệu là lớp kiểm soát truy cập có hiệu lực cuối cùng.",
  "Request approved. The requesting manager can now execute the deletion.": "Đã duyệt yêu cầu. Quản lý gửi yêu cầu có thể tiến hành xóa tài khoản.",
  "Deletion request rejected.": "Đã từ chối yêu cầu xóa.",
  "Request deletion": "Yêu cầu xóa",
  "Delete employee": "Xóa nhân sự",
  "Delete document": "Xóa văn bản",
  "Delete notification": "Xóa thông báo",
  "Add employee": "Thêm nhân sự",
  "Add document metadata": "Thêm thông tin văn bản",
  "Publish a notification": "Đăng thông báo",
  "Remove ": "Gỡ ",
  " from ": " khỏi ",
  " · protected": " · được bảo vệ",
  "LEVEL ": "CẤP ",
  "Your account opens directly into the office. Explore the floor plan, meet the team and enter the workspaces your role allows.": "Tài khoản của bạn mở thẳng vào văn phòng. Hãy khám phá mặt bằng, gặp gỡ đội ngũ và truy cập các khu vực phù hợp với vai trò.",
  "Managers send account deletion requests to ADMIN. After approval, only the requesting manager can execute that deletion. ADMIN can delete eligible accounts directly. The workflow is enforced by a protected Supabase Edge Function.": "Quản lý gửi yêu cầu xóa tài khoản cho ADMIN. Sau khi được duyệt, chỉ quản lý gửi yêu cầu mới được thực hiện. ADMIN có thể trực tiếp xóa tài khoản đủ điều kiện. Quy trình được kiểm soát bởi Supabase Edge Function bảo mật.",
  "Manage existing Supabase accounts, profile status and role assignments.": "Quản lý tài khoản Supabase hiện có, trạng thái hồ sơ và vai trò được gán.",
  "Role definitions and permission mappings are enforced in the database. Role editing is not enabled in this static browser client.": "Định nghĩa vai trò và phân quyền được áp dụng tại cơ sở dữ liệu. Trình duyệt tĩnh hiện không hỗ trợ chỉnh sửa vai trò.",
  "Account provisioning and role changes require a protected backend function.": "Việc tạo tài khoản và thay đổi vai trò cần backend được bảo vệ.",
  "Existing account profiles and assigned role names. Account provisioning and role changes require a protected backend function.": "Hồ sơ tài khoản hiện có và vai trò được gán. Việc tạo tài khoản và thay đổi vai trò cần backend được bảo vệ.",
  "Internal updates and your personal read status.": "Thông tin nội bộ và trạng thái đã đọc của bạn.",
  "Document metadata from the existing catalog. File upload and download require a configured Supabase Storage bucket and policies.": "Thông tin văn bản lấy từ danh mục hiện có. Tải lên và tải xuống tệp cần cấu hình bucket Supabase Storage cùng chính sách phù hợp.",
  "Expires at": "Thời điểm hết hạn",
  "Unnamed account": "Tài khoản chưa có tên",
  "Status": "Trạng thái",
  "Username": "Tên đăng nhập",
  "Roles": "Vai trò",
  "Time": "Thời gian",
  "Action": "Thao tác",
  "Module": "Phân hệ",
  "Target": "Đối tượng",
  "File": "Tệp",
  "Category": "Danh mục",
  "Title": "Tiêu đề",
  "Message": "Nội dung",
  "Priority": "Mức độ ưu tiên",
  "Employee": "Nhân sự",
  "Code": "Mã",
  "Position": "Chức vụ",
  "Actions": "Thao tác",
  "Account": "Tài khoản",
  "Account status changed to ACTIVE.": "Đã chuyển trạng thái tài khoản sang đang hoạt động.",
  "Account status changed to DISABLED.": "Đã chuyển trạng thái tài khoản sang đã vô hiệu hóa.",
  "Account status changed to LOCKED.": "Đã chuyển trạng thái tài khoản sang đã khóa.",
  "Employee updated.": "Đã cập nhật nhân sự.",
  "Employee created.": "Đã tạo nhân sự.",
  "Employee deleted.": "Đã xóa nhân sự.",
  "Document updated.": "Đã cập nhật văn bản.",
  "Document created.": "Đã tạo văn bản.",
  "Document deleted.": "Đã xóa văn bản.",
  "Notification updated.": "Đã cập nhật thông báo.",
  "Notification published.": "Đã đăng thông báo.",
  "Notification deleted.": "Đã xóa thông báo.",
  "Notification marked as read.": "Đã đánh dấu thông báo là đã đọc.",
  "No employee was changed. Check your access and try again.": "Không có nhân sự nào được cập nhật. Hãy kiểm tra quyền truy cập và thử lại.",
  "No employee was deleted. Check your access and try again.": "Không xóa được nhân sự. Hãy kiểm tra quyền truy cập và thử lại.",
  "No document was changed. Check your access and try again.": "Không có văn bản nào được cập nhật. Hãy kiểm tra quyền truy cập và thử lại.",
  "No document was deleted. Check your access and try again.": "Không xóa được văn bản. Hãy kiểm tra quyền truy cập và thử lại.",
  "No notification was changed. Check your access and try again.": "Không có thông báo nào được cập nhật. Hãy kiểm tra quyền truy cập và thử lại.",
  "No notification was deleted. Check your access and try again.": "Không xóa được thông báo. Hãy kiểm tra quyền truy cập và thử lại.",
  "Enter an employee code, name, and valid status.": "Vui lòng nhập mã nhân viên, họ tên và trạng thái hợp lệ.",
  "Enter a document code, title, category, and valid status.": "Vui lòng nhập mã, tiêu đề, danh mục và trạng thái hợp lệ cho văn bản.",
  "Enter a title, message, and valid priority.": "Vui lòng nhập tiêu đề, nội dung và mức độ ưu tiên hợp lệ.",
  "Choose a valid notification expiry date.": "Vui lòng chọn thời điểm hết hạn thông báo hợp lệ.",
  "Delete employee ": "Xóa nhân sự ",
  "Delete document ": "Xóa văn bản ",
  "Delete notification ": "Xóa thông báo ",
  "? This cannot be undone.": "? Thao tác này không thể hoàn tác.",
  "Edit document": "Chỉnh sửa văn bản",
  "Edit employee": "Chỉnh sửa nhân sự",
  "Edit notification": "Chỉnh sửa thông báo",
  "Create document": "Tạo văn bản",
  "Create employee": "Tạo nhân sự",
  "Publish notification": "Đăng thông báo",
  "Save changes": "Lưu thay đổi",
  "Saving…": "Đang lưu…",
  "Cancel": "Hủy",
  "Edit": "Chỉnh sửa",
  "Delete": "Xóa",
  "Draft": "Bản nháp",
  "Published": "Đã phát hành",
  "Archived": "Đã lưu trữ",
  "Low": "Thấp",
  "Normal": "Bình thường",
  "High": "Cao",
  "Urgent": "Khẩn cấp",
  "Mark as read": "Đánh dấu đã đọc",
  "Stop editing": "Ngừng chỉnh sửa",
  "No document categories are available. Add a category in the existing database before creating documents.": "Chưa có danh mục văn bản. Hãy thêm danh mục vào cơ sở dữ liệu trước khi tạo văn bản.",
  "Only the ADMIN account can delete user accounts.": "Chỉ tài khoản ADMIN mới có quyền xóa tài khoản người dùng.",
  "Your role cannot assign this access level.": "Vai trò của bạn không thể cấp quyền ở cấp này.",
  "Your role cannot change this account.": "Vai trò của bạn không thể thay đổi tài khoản này.",
  "No account was changed. Verify its role and RLS policy.": "Không có tài khoản nào được cập nhật. Hãy kiểm tra vai trò và chính sách RLS.",
  "The account deletion was not confirmed by the backend.": "Máy chủ chưa xác nhận việc xóa tài khoản.",
  "The account was deleted, but the audit event was not confirmed.": "Đã xóa tài khoản nhưng chưa xác nhận được sự kiện nhật ký.",
  "Account deleted and recorded in the audit log.": "Đã xóa tài khoản và ghi nhận vào nhật ký hoạt động.",
  "Account deletion requests": "Yêu cầu xóa tài khoản",
  "Approved": "Đã duyệt",
  "Rejected": "Đã từ chối",
  "Completed": "Đã hoàn tất",
  "Approve": "Phê duyệt",
  "Reject": "Từ chối",
  "ACCOUNT": "TÀI KHOẢN",
  "Description": "Mô tả",
  "—": "—",
  "ACTIVE": "ĐANG HOẠT ĐỘNG",
  "INACTIVE": "NGỪNG HOẠT ĐỘNG",
  "SUSPENDED": "TẠM NGƯNG",
  "LOCKED": "ĐÃ KHÓA",
  "DISABLED": "ĐÃ VÔ HIỆU HÓA",
  "PENDING": "ĐANG CHỜ",
  "APPROVED": "ĐÃ DUYỆT",
  "REJECTED": "ĐÃ TỪ CHỐI",
  "EXECUTING": "ĐANG THỰC HIỆN",
  "COMPLETED": "ĐÃ HOÀN TẤT",
  "LOW": "THẤP",
  "NORMAL": "BÌNH THƯỜNG",
  "HIGH": "CAO",
  "URGENT": "KHẨN CẤP",
  "DRAFT": "BẢN NHÁP",
  "PUBLISHED": "ĐÃ PHÁT HÀNH",
  "ARCHIVED": "ĐÃ LƯU TRỮ",
  "Executive suite": "Khu vực điều hành",
  "Leadership": "Ban lãnh đạo",
  "Accounts & access": "Tài khoản và quyền truy cập",
  "Company resources": "Tài liệu công ty",
  "Meet & collaborate": "Họp và cộng tác",
  "Front desk": "Quầy tiếp đón",
  "PERSONNEL": "NHÂN SỰ",
  "DOCUMENTS": "VĂN BẢN",
  "NOTIFICATIONS": "THÔNG BÁO",
  "AUDIT": "NHẬT KÝ",
  "USERS": "NGƯỜI DÙNG",
  "ROLES": "VAI TRÒ",
  "Supabase is not configured. Add the public project URL and publishable/anon key, then rebuild the app.": "Chưa cấu hình Supabase. Hãy thêm URL dự án và publishable/anon key, sau đó build lại ứng dụng.",
  "Supabase public configuration is invalid.": "Cấu hình Supabase công khai không hợp lệ.",
  "Supabase URL is invalid. Use an HTTPS project URL.": "URL Supabase không hợp lệ. Hãy sử dụng URL dự án HTTPS.",
  "The Supabase RLS policies are not confirmed. Apply them and set NEXT_PUBLIC_SUPABASE_RLS_READY=true before signing in.": "Chưa xác nhận chính sách RLS của Supabase. Hãy áp dụng chính sách và đặt NEXT_PUBLIC_SUPABASE_RLS_READY=true trước khi đăng nhập.",
  "Configure the Supabase public URL and publishable/anon key before entering the office.": "Hãy cấu hình URL Supabase và publishable/anon key trước khi vào văn phòng.",
  "Supabase did not return an authenticated user.": "Supabase không trả về thông tin người dùng đã xác thực.",
  "Supabase did not confirm the password update.": "Supabase chưa xác nhận việc cập nhật mật khẩu.",
  "Set a new password for your Drikapex account.": "Đặt mật khẩu mới cho tài khoản Drikapex của bạn.",
  "No access role is assigned to this account. Contact an administrator.": "Tài khoản chưa được gán vai trò truy cập. Vui lòng liên hệ quản trị viên.",
  "Preparing the office floor…": "Đang chuẩn bị mặt bằng văn phòng…",
  "Opening your workspace…": "Đang mở không gian làm việc…",
  "Return to sign in": "Quay lại đăng nhập",
  "DRIKAPEX · INTERNAL HEADQUARTERS": "DRIKAPEX · TRỤ SỞ NỘI BỘ",
  "DRIKAPEX · VIRTUAL OFFICE": "DRIKAPEX · VĂN PHÒNG ẢO",
  "DRIKAPEX HEADQUARTERS": "TRỤ SỞ DRIKAPEX",
  "DRIKAPEX INTERNAL · VIRTUAL OFFICE": "DRIKAPEX NỘI BỘ · VĂN PHÒNG ẢO",
  "Employee access verified": "Đã xác thực quyền nhân sự",
  "Administration dashboard": "Bảng điều khiển quản trị",
  "Documents": "Văn bản",
  "Updates": "Cập nhật",
  "This control center is separate from the office experience. Team members at level 3 and below are directed to the virtual office.": "Khu vực quản trị được tách biệt với văn phòng. Nhân sự từ cấp 3 trở xuống sẽ được chuyển thẳng vào văn phòng ảo.",
  "This control center is separate from the virtual office. Access depends on your role and permissions.": "Khu vực quản trị được tách biệt với văn phòng. Quyền truy cập phụ thuộc vào vai trò và quyền của bạn.",
  "Your role does not have permission for this dashboard section.": "Vai trò của bạn không có quyền truy cập mục này.",
  "Open virtual office": "Mở văn phòng ảo",
  "Access enforced by Supabase RLS": "Quyền truy cập được thực thi bởi Supabase RLS",
  "SYSTEM ADMINISTRATION · LEVEL ": "QUẢN TRỊ HỆ THỐNG · CẤP ",
  "SYSTEM ADMINISTRATION · LEVEL": "QUẢN TRỊ HỆ THỐNG · CẤP",
  "Work email": "Email công việc",
  "Choose a new password.": "Đặt mật khẩu mới.",
  "Reset your password.": "Đặt lại mật khẩu.",
  "Welcome back.": "Chào mừng bạn trở lại.",
  "Signing in…": "Đang đăng nhập…",
  "Sending…": "Đang gửi…",
  "Send reset link": "Gửi liên kết đặt lại",
  "Updating…": "Đang cập nhật…",
  "Show password": "Hiện mật khẩu",
  "Hide password": "Ẩn mật khẩu",
  "Workspace introduction": "Giới thiệu không gian làm việc",
  "Choose language": "Chọn ngôn ngữ",
  "Chọn ngôn ngữ": "Choose language",
  "Sign in": "Đăng nhập",
  "Forgot password?": "Quên mật khẩu?",
  "Need help?": "Bạn cần hỗ trợ?",
  "YOUR DIGITAL HEADQUARTERS": "TRỤ SỞ SỐ CỦA BẠN",
  "SPACE TO": "KHÔNG GIAN ĐỂ",
  "work well.": "làm việc hiệu quả.",
  "PEOPLE AT THE CENTER.": "CON NGƯỜI LÀ TRỌNG TÂM.",
  "ONE WORKSPACE": "MỘT KHÔNG GIAN LÀM VIỆC",
  "MANAGEMENT": "QUẢN LÝ",
  "LIVE DIRECTORY": "DANH BẠ TRỰC TUYẾN",
  "One place. Every team.": "Một không gian. Mọi đội ngũ.",
  "On the floor": "Nhân sự tại văn phòng",
  "Active accounts linked to the employee directory.": "Tài khoản đang hoạt động được liên kết với danh bạ nhân sự.",
  "YOU ARE HERE": "BẠN ĐANG Ở ĐÂY",
  "Directory unavailable": "Không thể tải danh bạ",
  "No active members yet": "Chưa có nhân sự đang hoạt động",
  "EXPLORE SPACES": "KHÁM PHÁ CÁC KHU VỰC",
  "3D view controls": "Điều khiển góc nhìn 3D",
  "Zoom in": "Phóng to",
  "Zoom out": "Thu nhỏ",
  "Rotate view left": "Xoay góc nhìn sang trái",
  "Rotate view right": "Xoay góc nhìn sang phải",
  "Reset 3D view": "Đặt lại góc nhìn 3D",
  "Camera focus controls": "Điều khiển ghim góc nhìn",
  "Choose actor to follow": "Chọn nhân viên cần ghim theo",
  "Select actor": "Chọn nhân viên",
  "Pin camera to selected actor": "Ghim camera theo nhân viên đã chọn",
  "Follow actor": "Theo nhân viên",
  "Pin camera to rug center": "Ghim camera ở giữa thảm",
  "Center": "Ghim giữa",
  "Move camera freely": "Tắt ghim để di chuyển tự do",
  "Free": "Tự do",
  "Hide actor and location labels": "Ẩn tên nhân viên và nhãn vị trí",
  "Show actor and location labels": "Hiện tên nhân viên và nhãn vị trí",
  "Drag to rotate · scroll to zoom": "Kéo để xoay · cuộn để thu phóng",
  "Drag to move · scroll to zoom": "Kéo để di chuyển mặt bằng · cuộn để thu phóng",
  "150 m² · SCALE MODEL 1:1.53": "150 m² · TỶ LỆ MÔ HÌNH 1:1,53",
  "A living workspace": "Không gian làm việc sống động",
  "Characters represent active account profiles. Their motion is illustrative; access remains controlled by Supabase.": "Nhân vật đại diện cho hồ sơ tài khoản đang hoạt động. Chuyển động chỉ mang tính minh họa; quyền truy cập vẫn do Supabase kiểm soát.",
  "ACTIVE PROFILE": "HỒ SƠ ĐANG HOẠT ĐỘNG",
  "ACTIVE PROFILES": "HỒ SƠ ĐANG HOẠT ĐỘNG",
  "Role permission list": "Danh sách quyền theo vai trò",
  "Select a role": "Chọn vai trò",
  "Protected": "Được bảo vệ",
  "Role permissions": "Quyền theo vai trò",
  "Account management": "Quản lý tài khoản",
  "My deletion requests": "Yêu cầu xóa của tôi",
  "Pending approval": "Chờ phê duyệt",
  "Deleting": "Đang xóa",
  "Execute deletion": "Thực hiện xóa",
  "Requested by ": "Người gửi yêu cầu: ",
  "Manager": "Quản lý",
  "Member": "Thành viên",
  "Administrator": "Quản trị viên",
  "Locked": "Đã khóa",
  "Disabled": "Đã vô hiệu hóa",
  "Choose role": "Chọn vai trò",
  "Assign role": "Gán vai trò",
  "Your account": "Tài khoản của bạn",
  "Higher/equal level · protected": "Cùng cấp hoặc cao hơn · được bảo vệ",
  "Only ADMIN can review pending deletion requests.": "Chỉ ADMIN mới có thể duyệt yêu cầu xóa đang chờ.",
  "Only managers can request deletion of lower-level accounts.": "Chỉ quản lý mới có thể yêu cầu xóa tài khoản cấp thấp hơn.",
  "Only the requesting manager can execute an approved request.": "Chỉ quản lý đã gửi yêu cầu mới được thực hiện yêu cầu đã duyệt.",
  "Your role cannot modify permissions at this level.": "Vai trò của bạn không thể thay đổi quyền ở cấp này.",
  "Assign capabilities to a role. Role hierarchy and database RLS remain authoritative.": "Gán quyền cho vai trò. Thứ bậc vai trò và chính sách RLS của cơ sở dữ liệu luôn có hiệu lực.",
  "Managers can edit permissions only for lower-level roles. Members cannot enter this dashboard even if a capability is added to their role. Changes are checked again by Supabase RLS.": "Quản lý chỉ có thể chỉnh sửa quyền của vai trò cấp thấp hơn. Thành viên không thể vào bảng điều khiển dù được bổ sung quyền. Mọi thay đổi đều được Supabase RLS kiểm tra.",
  "Select a category": "Chọn danh mục",
  "Metadata only": "Chỉ có thông tin mô tả",
  "Employee ID": "Mã nhân sự",
  "No role assigned": "Chưa được gán vai trò",
  "This module manages database metadata only. It does not upload or expose document files.": "Phân hệ này chỉ quản lý thông tin văn bản trong cơ sở dữ liệu, không tải lên hoặc cung cấp tệp.",
  "Read status is saved per authenticated user in notification_reads.": "Trạng thái đã đọc được lưu riêng cho từng tài khoản trong notification_reads.",
  "Writes are also enforced by the database RLS policies; interface permissions are not a security boundary.": "Các thao tác ghi cũng được kiểm soát bởi chính sách RLS; quyền hiển thị trên giao diện không thay thế bảo mật cơ sở dữ liệu.",
  "This view does not create audit records. Do not write trusted audit events from the browser client.": "Mục này không tạo bản ghi kiểm toán. Không ghi sự kiện kiểm toán tin cậy từ trình duyệt.",
  "A required Supabase table or API is unavailable. Check the existing database schema and API setup.": "Không tìm thấy bảng hoặc API Supabase cần thiết. Hãy kiểm tra schema cơ sở dữ liệu và cấu hình API.",
  "The email or password is incorrect.": "Email hoặc mật khẩu không chính xác.",
  "Your account does not have permission to access this information.": "Tài khoản của bạn không có quyền truy cập thông tin này.",
  "Too many requests. Wait a moment and try again.": "Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ một lát rồi thử lại.",
  "Supabase could not be reached. Check the project URL and your connection.": "Không thể kết nối Supabase. Hãy kiểm tra URL dự án và kết nối mạng.",
  "The request could not be completed. Please try again.": "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
  "The request could not be completed. Check your access and try again.": "Không thể hoàn tất yêu cầu. Hãy kiểm tra quyền truy cập và thử lại.",
};

const reverseTranslations = Object.entries(translations).reduce(
  (map, [english, vietnamese]) => {
    if (!map.has(vietnamese)) map.set(vietnamese, english);
    return map;
  },
  new Map<string, string>(),
);

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function translateText(text: string, language: Language): string {
  if (language === "en") {
    const exact = reverseTranslations.get(text);
    if (exact) return exact;
    const welcome = text.match(/^Chào mừng, (.+)$/);
    if (welcome) return `Welcome, ${welcome[1]}`;
    const memberCount = text.match(/^(\d+) hồ sơ đang hoạt động$/);
    if (memberCount) return `${memberCount[1]} ACTIVE ${Number(memberCount[1]) === 1 ? "PROFILE" : "PROFILES"}`;
    const moduleCount = text.match(/^(.+) · (\d+)$/);
    if (moduleCount) {
      const title = reverseTranslations.get(moduleCount[1]);
      if (title) return `${title} · ${moduleCount[2]}`;
    }
    return text;
  }
  const exact = translations[text];
  if (exact) return exact;

  const welcome = text.match(/^Welcome, (.+)$/);
  if (welcome) return `Chào mừng, ${welcome[1]}`;

  const accountStatus = text.match(/^Account status changed to (ACTIVE|LOCKED|DISABLED)\.$/);
  if (accountStatus) {
    const status = {
      ACTIVE: "đang hoạt động",
      LOCKED: "đã khóa",
      DISABLED: "đã vô hiệu hóa",
    }[accountStatus[1]];
    return `Đã chuyển trạng thái tài khoản sang ${status}.`;
  }

  const named = text.match(/^(Accounts & access|Roles & permissions|Audit log|People|Documents|Notifications) · (\d+)$/);
  if (named) return `${translations[named[1]] ?? named[1]} · ${named[2]}`;

  const pending = text.match(/^Account deletion requests · (\d+) pending$/);
  if (pending) return `Yêu cầu xóa tài khoản · ${pending[1]} đang chờ`;

  const memberCount = text.match(/^(\d+) ACTIVE (PROFILE|PROFILES)$/);
  if (memberCount) return `${memberCount[1]} hồ sơ đang hoạt động`;

  const requestedBy = text.match(/^Requested by (.+) · $/);
  if (requestedBy) return `Người gửi yêu cầu: ${requestedBy[1]} · `;

  const moduleCount = text.match(/^(.+) · (\d+)$/);
  if (moduleCount && translations[moduleCount[1]]) {
    return `${translations[moduleCount[1]]} · ${moduleCount[2]}`;
  }

  return text;
}

function sourceText(node: Text, translated: WeakMap<Text, string>, language: Language) {
  const previous = translated.get(node);
  if (previous !== undefined && node.nodeValue === translateText(previous, language)) {
    return previous;
  }
  return node.nodeValue ?? "";
}

function localizeDocument(
  root: Node,
  language: Language,
  translated: WeakMap<Text, string>,
  attributes: WeakMap<Element, Map<string, string>>,
) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (parent && !parent.closest("script,style,noscript,[data-no-translate]")) {
      const original = sourceText(textNode, translated, language);
      translated.set(textNode, original);
      const localized = translateText(original, language);
      if (textNode.nodeValue !== localized) textNode.nodeValue = localized;
    }
    node = walker.nextNode();
  }

  const elements =
    root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...(root as ParentNode).querySelectorAll("*")];
  for (const element of elements) {
    if (element.closest("script,style,noscript,[data-no-translate]")) continue;
    let originals = attributes.get(element);
    if (!originals) {
      originals = new Map();
      attributes.set(element, originals);
    }
    for (const name of ["aria-label", "title", "placeholder", "alt"]) {
      const current = element.getAttribute(name);
      if (current === null) {
        originals.delete(name);
        continue;
      }
      const previous = originals.get(name);
      const original =
        previous !== undefined && current === translateText(previous, language)
          ? previous
          : current;
      originals.set(name, original);
      const localized = translateText(original, language);
      if (localized !== current) element.setAttribute(name, localized);
    }
  }
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }
  return value;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("vi");
  const currentLanguage = useRef<Language>("vi");
  const translatedTexts = useRef(new WeakMap<Text, string>());
  const translatedAttributes = useRef(new WeakMap<Element, Map<string, string>>());

  const setLanguage = useCallback((next: Language) => {
    currentLanguage.current = next;
    window.localStorage.setItem("drikapex-language", next);
    document.documentElement.lang = next;
    setLanguageState(next);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("drikapex-language");
    const initial: Language = stored === "en" ? "en" : "vi";
    currentLanguage.current = initial;
    document.documentElement.lang = initial;
    const languageTimer =
      initial === "vi"
        ? null
        : window.setTimeout(() => setLanguageState(initial), 0);

    const root = document.body;
    localizeDocument(
      root,
      initial,
      translatedTexts.current,
      translatedAttributes.current,
    );
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof Element) {
          localizeDocument(
            record.target,
            currentLanguage.current,
            translatedTexts.current,
            translatedAttributes.current,
          );
        } else if (record.type === "characterData" && record.target instanceof Text) {
          const textNode = record.target;
          const original = sourceText(
            textNode,
            translatedTexts.current,
            currentLanguage.current,
          );
          translatedTexts.current.set(textNode, original);
          const localized = translateText(original, currentLanguage.current);
          if (textNode.nodeValue !== localized) textNode.nodeValue = localized;
        } else {
          for (const addedNode of record.addedNodes) {
            if (addedNode instanceof Element || addedNode instanceof DocumentFragment) {
              localizeDocument(
                addedNode,
                currentLanguage.current,
                translatedTexts.current,
                translatedAttributes.current,
              );
            }
          }
        }
      }
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["aria-label", "title", "placeholder", "alt"],
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      if (languageTimer !== null) window.clearTimeout(languageTimer);
    };
  }, []);

  useEffect(() => {
    currentLanguage.current = language;
    document.documentElement.lang = language;
    localizeDocument(
      document.body,
      language,
      translatedTexts.current,
      translatedAttributes.current,
    );
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
      <nav
        aria-label={language === "vi" ? "Chọn ngôn ngữ" : "Choose language"}
        className="language-switcher"
        data-no-translate
      >
        <button
          aria-pressed={language === "vi"}
          className={language === "vi" ? "language-switcher__active" : ""}
          onClick={() => setLanguage("vi")}
          type="button"
        >
          VI
        </button>
        <button
          aria-pressed={language === "en"}
          className={language === "en" ? "language-switcher__active" : ""}
          onClick={() => setLanguage("en")}
          type="button"
        >
          EN
        </button>
      </nav>
    </LanguageContext.Provider>
  );
}
