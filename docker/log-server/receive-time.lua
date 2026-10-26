-- レコードの時刻を、受け口が受け取った時刻に置き換える（fluent-bit.yaml の lua フィルター）。
-- ファイル名の日付（app-%Y-%m-%d など）はこの時刻で決まる。送り手が付けた時刻のままだと、
-- 乗っ取られた送り手が過去の日付のファイルに書き込み、その日のファイルを押し出したり偽の行を混ぜたりできるため。
-- アプリが出した時刻は、レコードの time に残る。
function set_receive_time(tag, timestamp, record)
  return 1, os.time(), record
end
