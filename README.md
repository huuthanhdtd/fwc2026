…create a new repository on the command line
```
echo "# fwc2026" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/huuthanhdtd/fwc2026.git
git push -u origin main
```

…or push an existing repository from the command line
```
git remote add origin https://github.com/huuthanhdtd/fwc2026.git
git branch -M main
git push -u origin main
```


1.Đăng ký:  `/do <#số thứ tự trận> n1-n1[,n2-n2],...`

(Tỉ số chủ nhà trước)

2.Sửa tỉ số:  `/change <#số thứ tự trận> <tỉ số cũ n-n> <tỉ số mới n-n>`

3.🩸Khô máu:  /khomau <#số thứ tự trận> n1-n1[,n2-n2],...

　(Đăng ký sau khi hết hiệp 1)

4.⭐Hiệp phụ:  /hp <#số thứ tự trận> n1-n1[,n2-n2],...

5.Xem lịch: /today,

　Ngày khác: /M/d (M= tháng, d = ngày)

　Sắp tới: /upcoming

6.Xem đăng ký: /me [all/<#số thứ tự trận>/M/d]

　(với M/d là ngày đăng ký)

7.Xem top: /top [do/win/lost/khomau/hp]

8.Xem tài khoản: /bet [all]

9.Đăng ký 4 đội bán kết: /bk đội 1, đội 2, đội 3, đội 4

10.Đăng ký 2 đội chung kết: /ck đội 1, đội 2

11.Đăng ký đội vô địch: /vđ or /vd tên đội

12.Đăng ký vua phá lưới: /vpl tên cầu thủ