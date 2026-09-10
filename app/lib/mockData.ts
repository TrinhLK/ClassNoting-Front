// src/lib/mockData.ts

// 1. Định nghĩa kiểu dữ liệu
export type Segment = {
  id: string;
  speakerId: string;
  start: number;
  end: number;
  text: string;
  words?: Word[];
};

export type Word = {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export type Speaker = {
  id: string;
  name: string;
  color: string;
};

// ==========================================================
// KHU VỰC COPY - PASTE DỮ LIỆU TỪ PYTHON
// ==========================================================

// 👉 Mở file 'transcript_with_time.txt', copy toàn bộ và paste vào giữa hai dấu backtick (`)
export const RAW_TRANSCRIPT_FILE = `
[SPEAKER_00] (00:00 -> 00:43): Và bây giờ cuốn sách không chỉ là những cuốn sách như ngày xưa nữa, nó đã thay đổi rất nhiều. Và ngày hôm nay tôi muốn giới thiệu với các bạn 3 vị khách mời rất là đặc biệt để có thể chia sẻ với chúng ta sự thay đổi của sách, sự thay đổi của cách đọc, sự thay đổi của chính người đọc. Dạ vâng, tôi xin dân vận giới thiệu anh Lê Thạch là giám đốc của Void FM. Chào anh Thạch. Dạ vâng, người thứ 2, tôi xin giới thiệu chị Hải Ngọc, giám đốc sản xuất của Binh Tị Búc. Vị khách mời thứ 3, anh Nguyễn Xuân Minh đến từ Nhã Nam.

[SPEAKER_02] (00:46 -> 01:09): Hôm nay chúng ta sẽ được lắng nghe những câu chuyện bếp đúc của họ. Họ đã làm sách như thế nào, đã đổi mới ra sao. Có lẽ bắt đầu câu chuyện này sẽ là phần chia sẻ từ phía anh Minh đi. Anh hãy nói cho Hùng Minh và khán giả biết rằng Nhã Nam nói riêng và các công ty phát hành sách, những người làm sách nói chung đã và đang làm những gì để những cuốn sách mà chúng ta đang cầm tiếp tục được đổi mới, tiếp tục trở nên phong phú và đa dạng hơn.

[SPEAKER_04] (01:10 -> 02:38): Xin cảm ơn chị Hùng Minh và anh Tiến. Nếu mà chị riêng nói về việc sản xuất từ một góc độ, một nhà sản xuất đi, thì tôi thấy có một sự thay đổi lớn nhất là sau khi công Việt Nam tan nhập công ức Burn, thì các đơn vị xuất bản tư nhân như Nhã Nam hay là Đinh Tị bắt đầu được thành lập và được chính thức hóa và được công nhận. Càng gần đây thì chúng tôi tiến càng nhanh hơn với tốc độ xuất bản của thế giới. Thay vì là mình đi theo họ thì bây giờ mình đã tham gia các hội sửa sách lớn như là Frankfurt, London hay Bologna. Ở đó thì người ta sẽ không giới thiệu các đầu sách đã bán chạy sẵn mà người ta sẽ luôn luôn giới thiệu những đầu sách mà họ tin là sang Nam họ sẽ bán chạy. Tôi tin rằng với sự năng động của các đơn vị xuất bản hiện nay thì sang Nam chúng ta sẽ đọc được những thứ nhanh ngang với thế giới rồi. Thứ hai là xu hướng về áp dụng công nghệ sẽ được đẩy mạnh nhiều hơn. Thứ ba là một cái thay đổi lớn là lực lượng đọc giả. Các bạn trẻ hơn, các bạn đọc nhiều hơn, các bạn đọc hay hơn, đọc giỏi hơn và các bạn có thể tóm tắt cuốn sách tử viết những bài review rất hay, rất cảm động và làm những video TikTok mà có thể lên đến hàng triệu view giới thiệu quán sách. Đấy lấy là những cái quan sát thay đổi trong việc đọc sách và làm sách mà em quan sát được trong khoảng thời gian mình làm việc.

[SPEAKER_02] (02:38 -> 03:37): Hồng Minh cũng chia sẻ tin vui với anh Tiến cùng như tất cả các quý vị ngồi ở đây. Đấy là sách Việt Nam cũng đã có một cái ngách tuy là không rộng lắm một ngách khơi hẹp một chút thôi cũng đã được chuyển ngữ sang nước ngoài và được mua bản quyền. Bên cạnh một tác phẩm rất là điển hình là Nhật ký trong tù đã từng được dịch xe khoảng tầm hơn 50 thứ tiếng trên thế giới về ý nghĩa lịch sử, văn hóa rất là tặc biệt của nó thì nhiều ấn phẩm khác cũng đã được dịch xa các tác phẩm văn học của Việt Nam bao gồm Chuyện Kiều, các tác phẩm của Nguyễn Huy Thiệp hay là tác phẩm của Lê Liệu Trẳng Hạ. Và gần đây thì cái cuốn trang hoang dã gấu dịch sang tiếng Anh, tiếng Trung, tiếng Hàn rất là nhiều và đã được một cái giải thưởng với Tranh Minh Hoạ do một cái giải thưởng rất là uy tín của anh trao tặng những tiến hiệu rất là vui để cái điều mong muốn chúng ta đặt ra ở đây đã có tiền lệ và nó sẽ là một cái điều dần dần dưỡng thành phổ biến hơn để chúng ta chia sẻ với nhau niềm tự hào. Thì ở đây cũng rất là muốn nên thật có thể chia sẻ với quý vị khán giả những câu chuyện liên quan đến sách nói và cả những thông tin liên quan đến thị trường sách nói.

[SPEAKER_03] (03:37 -> 04:23): Đầu tiên là xin chào anh Tiến và chị Minh. Thật ra với nhành sách nói ở Việt Nam thì nó cũng chỉ mới vừa phát triển gần đây thôi từ khoảng cuối năm 2018 và Vojavem cũng ra đời khoảng thời gian đó là khoảng năm 2019. Trong suốt thời gian qua thì có thể nói là thị trường sách nói Việt Nam phát triển rất là nhanh. Theo số liệu của Google, có sự tìm kiếm đối với sách nói gần như là tương tự với sách điện tử. Và đây là một cái xu hướng mà nó tương tự với một số nền xuất bảng phát triển tương đối như là Hàn Quốc hay là Italia. Thì đó là một cái tín hiệu cũng rất là đáng mừng. Và thật ra mình cũng nghĩ cái đó là cái xu hướng không thể nào đảo ngược được và nó rất là phù hợp với các bạn trẻ ở một cái quốc gia đang phát triển và rõ ràng là sách nói nó là một cái giải pháp ra đời đúng lúc và đúng thời điểm cho các bạn.

[SPEAKER_00] (04:23 -> 05:04): Tôi rất là cảm ơn Thạch vì một trong cuốn sách mà tôi rất yêu quý và giới thiệu với rất là nhiều doanh nhân cuốn Think Again tại Tư Duy đã được các bạn làm thành sách nói. Tôi muốn chia sẻ cuốn sách tôi đang làm thì tôi cũng làm theo hình thức là thể tương tác được với người đọc. Tức là người đọc có thể quét QR code, có thể vào trong website để chia sẻ những video, những nhận xét, những đánh giá với chính người viết và ngược lại. Thế thì cái cách hình thức đấy mà Đinh Tị đang làm thì các bạn thấy có hiệu quả không, có tạo ra sự hấp dẫn không và đặc biệt đối với cả Gen Z và Gen Anfa ngày hôm nay.

[SPEAKER_01] (05:04 -> 06:28): Qua khoảng 10 năm có những cái quan sát ở trên thị trường và cũng rất là thận trọng với việc nghiên cứu tâm lý và hành vi của trẻ nhỏ. Đinh Tị mới phát hiện ra là cái sách mà kín giữ như vậy nó không còn phù thụ, không còn phù hợp với cái lứa tuổi từ 0 đến 6 nữa. Cho nên là quyết định là mình sẽ phải có một cái gì để đổi mới. Và sau một thời gian an đi mất độ khoảng 3 năm, Đinh Tị đã cho ra đời dòng sách tương tác thông minh. Ngoài việc đọc sách thì chúng ta có thể trải nghiệm những cái giác quan khác với cuốn sách đó. Ví dụ như chúng ta có thể nghe sách âm thanh này, chúng ta có thể dùng tay và có những cái tương tác trên chính cái quyển sách đấy. Chúng ta có thể là ngửi mùi hương của cuốn sách đó. Và chúng ta cũng có thể là mang cả một cái dạp chiếu phim vào trong nhà biến những cái hình ảnh nhỏ nhỏ trong cuốn sách có thể phóng đại đến khoảng gấp 10 đến 15 lần trên trần nhà, hoặc trên tường nhà. Và thậm chí là những cái hình ảnh đó là còn có màu. Cùng với đó là chúng ta sẽ nghe audio của cái cuốn sách đó và chúng tôi có thể đưa vào đó những cái tiếng dao của người Việt Nam. Ví dụ như là ai bánh mì nóng giòn đây thì chúng ta không thể tìm được ở trong những cái cuốn sách nước ngoài. Chúng tôi đã đưa những cái rất là Việt Nam, rất là gần khu. Lát bản địa hóa, đúng không? Đúng rồi. Và trong những cái cuốn sách của chúng tôi lành cho thiếu nhìn.

[SPEAKER_02] (06:28 -> 06:58): Khi mà nghe chị Ngọc chị chia sẻ thì Hồng Minh nghĩ rằng chúng ta cần định nghĩa lại sách nó khác đi. Sách đôi khi nó không phải chỉ câu chuyện cầm đầy đọc nữa mà nó như một sự trải nghiệm tất cả các giác quan, trí tuệ và cảm xúc. Nó thực sự là một người bạn để chúng ta có thể nói chuyện vui buồn và khám phá với nhau ở trong đó, đúng không ạ? Thế còn với sách nói thì như thế nào? Chỉ có giọng nói thôi. Các bạn sẽ làm như thế nào để sách nói có thể hấp dẫn đối với những thính giả của mình?

[SPEAKER_03] (06:59 -> 08:00): Bên cạnh cái việc là sử dụng hình thức âm thanh, thì sẽ còn với voiceFM thì còn ứng dụng công nghệ nữa. Với công nghệ thì nó sẽ hơi giúp cho người ta rất là nhiều thứ. Tức là ví dụ như các bạn nghĩ là khi mà các bạn đọc sách thì các bạn có một cái thẻ, các bạn đánh dấu đoạn đọc tới đâu. Còn bây giờ với sách nói các bạn nghe tới đâu, nó tự động đánh dấu. Lần sau các bạn mở lên đúng cái đoạn đấy. Hoặc là các bạn có thể hiện giờ nghe lỡ ngủ quên, thì nó có thể tự động ngát. Lần sau mở lên nghe bài nghe tiếp không có lỡ gì cả. Hoặc là bây giờ đã có những thuật toán thông minh. Tại vì bây giờ thật ra là các bạn hồi trước ở lứa tuổi của mình thì bị một vấn đề là ích sách và không có thèm. Bây giờ các bạn nhiều và không biết chọn gì. Bây giờ công nghệ, những thuật toán thông minh nó sẽ gửi ý cho các bạn tùy theo nhu cầu. Đó là những cái công nghệ nó hỗ trợ cho mình để mà cái hình thức này trở nên hấp dẫn hơn. Tuy nhiên bên cạnh đó thì bản chất sản phẩm cũng sẽ có những cái điểm để thu hút thí dạ. Ví dụ như là tác giả tự đọc tác phẩm. Ví dụ gần đây có anh Hồ Huy Sơn thì đọc lại một loạt ba tác phẩm dành cho thiếu nhiên.
`; 
// (Lưu ý: Bạn paste nội dung thật của bạn đè lên ví dụ trên nhé)


// 👉 Mở file 'summary.txt', copy toàn bộ và paste vào đây
export const RAW_SUMMARY_FILE = `
# BIÊN BẢN TÓM TẮT CUỘC HỌP

## 1. TỔNG QUAN
Cuộc họp tập trung vào việc phân tích xu hướng và thách thức trong lĩnh vực xuất bản sách nói hiện nay. Các diễn giả đều nhấn mạnh sự cần thiết và khả năng của việc tái chế tạo và cập nhật nội dung sách nói nhằm thích nghi với xu hướng kỹ thuật và thay đổi của độc giả trẻ.

## 2. NỘI Dung
### 🗣️ Hoàng Nam Tiến
* **Quan điểm chính:** Cuối cùng, mục tiêu là tạo ra những cuốn sách nói phong phú và đa dạng hơn.
* **Chi tiết:**
  - Tổng kết quá trình phát triển của ngành xuất bản sách nói ở Việt Nam.
  - Giới thiệu dự án "Think Again" của ông, mô hình tương tác giữa tác giả và độc giả.
  
### 🗣️ Nam Minh
* **Quan điểm chính:** Sự thay đổi trong việc đọc sách và làm sách nói.
* **Chi tiết:**
  - Gợi ý về việc chuyển ngữ các tác phẩm Việt Nam sang ngoại ngữ.
  - Khắc phục tình trạng sách nói chưa phổ biến bằng việc chuyển đổi hình thức.

### 🗣️Lê Thạch
* **Quan điểm chính:** Xu hướng phát triển của sách nói ở Việt Nam.
* **Chi tiết:**
  - Thị trường sách nói phát triển nhanh kể từ cuối năm 2018.
  - So sánh xu hướng phát triển với các nước phát triển khác.

### 🗣️Hải Ngọc
* **Quan điểm chính:** Cần định nghĩa lại sách nói.
* **Chi tiết:**
  - Phát hiện cuốn sách kín đáo không còn phù hợp với lứa tuổi từ 0-6.
  - Sản phẩm mới: sách tương tác thông minh.

### 🗣️Nguyễn Xuân Minh
* **Quan điểm chính:** Công nghệ đóng vai trò quan trọng yếu trong việc thu hút chú độc giả.
* **Chi tiết:**
  - Sử dụng công nghệ để tạo tiện lợi cho người dùng.
  - Áp dụng thuật toán thông minh để gợi ý sách phù hợp sở thích của độc giả.

## 3.KẾT LUẬN
Bên dưới là những luận điểm chính và đề xuất cụ thể về việc cải tiến và phát triển trong lĩnh vực sách nói:

- Cần tăng cường sự sáng tạo và cập nhật nội dung sách nói.
- Sử dụng công nghệ để tối ưu hoá trải nghiệm đọc sách.
- Định nghĩa lại sách nói như một phương tiện để trải nghiệm toàn diện.
- Cần nâng cao chất lượng và sự lựa chọn cho độc giả trẻ. 

Trở thành một cuốn sách nói phong phú và đa dạng hơn, đáp ứng nhu cầu của độc giả hiện đại.
`;

// ==========================================================