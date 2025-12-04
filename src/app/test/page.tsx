'use client';

import { useState } from 'react';

export default function TestGifPage() {
  const [testStatus, setTestStatus] = useState<string>('等待开始测试...');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    console.log('🔍 TEST LOG:', message);
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const testGifEncoder = async () => {
    try {
      setTestStatus('测试gifencoder...');
      addLog('🚀 开始测试gifencoder生成GIF');

      // 使用根目录的两个SVG图片
      const testImages = [
        '/vercel.svg',
        '/next.svg'
      ];

      addLog(`📷 使用测试图片: ${testImages.join(', ')}`);

      // 导入gifencoder
      addLog('📦 导入gifencoder模块...');
      const { default: GIFEncoder } = await import('gifencoder');

      if (!GIFEncoder) {
        throw new Error('gifencoder导入失败');
      }

      addLog('✅ gifencoder模块导入成功');
      addLog(`📋 GIFEncoder类型: ${typeof GIFEncoder}`);

      // 创建Canvas
      addLog('🎨 创建Canvas...');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas上下文创建失败');
      }

      canvas.width = 200;
      canvas.height = 200;
      addLog(`✅ Canvas创建成功: ${canvas.width}x${canvas.height}`);

      // 创建GIF编码器
      addLog('⚙️ 创建GIF编码器...');
      const encoder = new GIFEncoder(canvas.width, canvas.height);
      addLog('✅ GIF编码器创建成功');

      // 配置编码器
      encoder.start();
      encoder.setRepeat(0); // 循环播放
      encoder.setDelay(500); // 500ms每帧
      encoder.setQuality(20); // 质量
      addLog('⚙️ GIF编码器配置完成');

      // 加载并处理每张图片
      for (let i = 0; i < testImages.length; i++) {
        addLog(`📷 处理第 ${i + 1} 张图片: ${testImages[i]}`);

        const img = new Image();
        img.crossOrigin = 'anonymous'; // 允许跨域

        await new Promise<void>((resolve, reject) => {
          addLog(`⏳ 开始加载图片...`);

          const timeout = setTimeout(() => {
            reject(new Error('图片加载超时'));
          }, 10000);

          img.onload = () => {
            clearTimeout(timeout);
            addLog(`✅ 图片加载成功: ${img.width}x${img.height}`);
            resolve();
          };

          img.onerror = (error) => {
            clearTimeout(timeout);
            addLog(`❌ 图片加载失败: ${error}`);
            reject(new Error(`图片加载失败: ${testImages[i]}`));
          };

          addLog(`🌐 设置图片源: ${window.location.origin}${testImages[i]}`);
          img.src = testImages[i];
        });

        // 清空画布
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制图片（居中）
        const scale = Math.min(
          canvas.width / img.width,
          canvas.height / img.height
        );
        const width = img.width * scale;
        const height = img.height * scale;
        const x = (canvas.width - width) / 2;
        const y = (canvas.height - height) / 2;

        ctx.drawImage(img, x, y, width, height);
        addLog(`🎨 图片绘制完成: scale=${scale.toFixed(2)}`);

        // 添加到GIF
        encoder.addFrame(ctx);
        addLog(`📹 第 ${i + 1} 帧添加到GIF`);
      }

      // 完成编码
      addLog('🏁 完成GIF编码...');
      encoder.finish();

      // 获取GIF数据
      addLog('📊 获取GIF数据...');
      const gifBuffer = encoder.out.getData();
      addLog(`✅ GIF数据获取成功: ${gifBuffer.length} bytes`);

      const gifBlob = new Blob([gifBuffer], { type: 'image/gif' });
      addLog(`📦 GIF Blob创建成功: ${gifBlob.size} bytes`);

      // 下载GIF
      addLog('⬇️ 创建下载链接...');
      const url = URL.createObjectURL(gifBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `test-gif-${Date.now()}.gif`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addLog('✅ GIF下载成功！');
      setTestStatus('✅ gifencoder测试成功！');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`❌ gifencoder测试失败: ${errorMsg}`);
      addLog(`📋 错误堆栈: ${error instanceof Error ? error.stack : 'N/A'}`);
      setTestStatus('❌ gifencoder测试失败');
    }
  };

  const testNbaGifEncoder = async () => {
    try {
      setTestStatus('测试NBA图片GIF合成...');
      addLog('🏀 开始测试NBA图片GIF合成');

      // 使用nba文件夹的14张图片
      const testImages = [];
      for (let i = 1; i <= 14; i++) {
        testImages.push(`/nba/下载 (${i}).jpg`);
      }

      addLog(`📷 使用NBA测试图片: ${testImages.length} 张`);
      addLog(`📋 图片列表: ${testImages.slice(0, 5).join(', ')}...`);

      // 导入gifencoder
      addLog('📦 导入gifencoder模块...');
      const { default: GIFEncoder } = await import('gifencoder');

      if (!GIFEncoder) {
        throw new Error('gifencoder导入失败');
      }

      addLog('✅ gifencoder模块导入成功');

      // 创建Canvas
      addLog('🎨 创建Canvas...');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        throw new Error('Canvas上下文创建失败');
      }

      canvas.width = 400; // 更大的尺寸
      canvas.height = 300;
      addLog(`✅ Canvas创建成功: ${canvas.width}x${canvas.height}`);

      // 创建GIF编码器
      addLog('⚙️ 创建GIF编码器...');
      const encoder = new GIFEncoder(canvas.width, canvas.height);
      addLog('✅ GIF编码器创建成功');

      // 配置编码器
      encoder.start();
      encoder.setRepeat(0); // 循环播放
      encoder.setDelay(200); // 200ms每帧 = 5fps
      encoder.setQuality(10); // 更好的质量
      addLog('⚙️ GIF编码器配置完成');

      // 加载并处理每张图片
      for (let i = 0; i < testImages.length; i++) {
        addLog(`📷 处理第 ${i + 1}/${testImages.length} 张图片: ${testImages[i]}`);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`图片加载超时: ${testImages[i]}`));
          }, 15000);

          img.onload = () => {
            clearTimeout(timeout);
            addLog(`✅ 图片加载成功: ${img.width}x${img.height}`);
            resolve();
          };

          img.onerror = (error) => {
            clearTimeout(timeout);
            addLog(`❌ 图片加载失败: ${testImages[i]}`);
            reject(new Error(`图片加载失败: ${testImages[i]}`));
          };

          img.src = testImages[i];
        });

        // 清空画布
        ctx.fillStyle = '#000000'; // 黑色背景
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制图片（居中，保持比例）
        const scale = Math.min(
          canvas.width / img.width,
          canvas.height / img.height
        );
        const width = img.width * scale;
        const height = img.height * scale;
        const x = (canvas.width - width) / 2;
        const y = (canvas.height - height) / 2;

        ctx.drawImage(img, x, y, width, height);
        addLog(`🎨 图片绘制完成: scale=${scale.toFixed(2)}, pos=(${x.toFixed(1)}, ${y.toFixed(1)})`);

        // 添加到GIF
        encoder.addFrame(ctx);
        addLog(`📹 第 ${i + 1} 帧添加到GIF`);
      }

      // 完成编码
      addLog('🏁 完成GIF编码...');
      encoder.finish();

      // 获取GIF数据
      addLog('📊 获取GIF数据...');
      const gifBuffer = encoder.out.getData();
      addLog(`✅ GIF数据获取成功: ${gifBuffer.length} bytes`);

      const gifBlob = new Blob([gifBuffer], { type: 'image/gif' });
      addLog(`📦 GIF Blob创建成功: ${gifBlob.size} bytes`);

      // 下载GIF
      addLog('⬇️ 创建下载链接...');
      const url = URL.createObjectURL(gifBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nba-gif-${Date.now()}.gif`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addLog('✅ NBA GIF下载成功！');
      setTestStatus('✅ NBA GIF测试成功！');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`❌ NBA GIF测试失败: ${errorMsg}`);
      addLog(`📋 错误堆栈: ${error instanceof Error ? error.stack : 'N/A'}`);
      setTestStatus('❌ NBA GIF测试失败');
    }
  };

  const testGifshot = async () => {
    try {
      setTestStatus('测试gifshot...');
      addLog('🚀 开始测试gifshot生成GIF');

      // 使用根目录的两个SVG图片
      const testImages = [
        '/vercel.svg',
        '/next.svg'
      ];

      addLog(`📷 使用测试图片: ${testImages.join(', ')}`);

      // 导入gifshot
      addLog('📦 导入gifshot模块...');
      const gifshotModule = await import('gifshot');
      const gifshot = gifshotModule.default || gifshotModule;

      if (!gifshot) {
        throw new Error('gifshot导入失败');
      }

      addLog('✅ gifshot模块导入成功');
      addLog(`📋 gifshot类型: ${typeof gifshot}`);

      // 测试gifshot
      const result = await new Promise((resolve, reject) => {
        addLog('⚙️ 配置gifshot参数...');

        const timeout = setTimeout(() => {
          reject(new Error('gifshot超时'));
        }, 10000);

        const options = {
          images: testImages,
          gifWidth: 200,
          gifHeight: 200,
          interval: 0.5,
          complete: (gif: any) => {
            clearTimeout(timeout);
            addLog('✅ gifshot生成完成');
            addLog(`📊 生成结果类型: ${typeof gif}`);
            addLog(`📊 生成结果keys: ${gif ? Object.keys(gif) : 'null'}`);
            resolve(gif);
          },
          error: (error: any) => {
            clearTimeout(timeout);
            addLog(`❌ gifshot错误回调: ${error}`);
            addLog(`📋 错误类型: ${typeof error}`);
            addLog(`📋 错误信息: ${JSON.stringify(error)}`);
            reject(new Error(`gifshot错误: ${error}`));
          }
        };

        addLog('🚀 调用gifshot.createGIF...');
        addLog(`📋 选项配置: ${JSON.stringify(options, null, 2)}`);

        try {
          const callResult = gifshot.createGIF(options);
          addLog(`📋 gifshot.createGIF返回值: ${callResult}`);
        } catch (callError) {
          clearTimeout(timeout);
          addLog(`❌ gifshot.createGIF调用异常: ${callError}`);
          reject(new Error(`gifshot调用异常: ${callError}`));
        }
      });

      // 处理结果
      addLog('📊 处理gifshot返回结果...');
      addLog(`📊 结果类型: ${typeof result}`);
      addLog(`📊 结果内容: ${JSON.stringify(result, null, 2).substring(0, 500)}...`);

      if (result && result.image) {
        // 下载GIF
        const link = document.createElement('a');
        link.href = result.image;
        link.download = `gifshot-test-${Date.now()}.gif`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        addLog('✅ gifshot GIF下载成功！');
        setTestStatus('✅ gifshot测试成功！');
      } else {
        throw new Error('gifshot返回了无效结果');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`❌ gifshot测试失败: ${errorMsg}`);
      addLog(`📋 错误堆栈: ${error instanceof Error ? error.stack : 'N/A'}`);
      setTestStatus('❌ gifshot测试失败');
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setTestStatus('等待开始测试...');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">🧪 GIF生成测试页面</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">测试状态</h2>
          <div className={`text-lg font-mono ${testStatus.includes('成功') ? 'text-green-600' : testStatus.includes('失败') ? 'text-red-600' : 'text-blue-600'}`}>
            {testStatus}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">测试按钮</h2>
          <div className="flex flex-wrap gap-4 mb-4">
            <button
              onClick={testGifEncoder}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              🎬 测试 gifencoder
            </button>
            <button
              onClick={testNbaGifEncoder}
              className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              🏀 NBA图片GIF (14帧)
            </button>
            <button
              onClick={testGifshot}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              🎯 测试 gifshot
            </button>
            <button
              onClick={clearLogs}
              className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              🧹 清除日志
            </button>
          </div>
          <p className="text-sm text-gray-600">
            使用根目录的 vercel.svg 和 next.svg 进行测试
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">调试日志</h2>
            <span className="text-sm text-gray-500">{logs.length} 条日志</span>
          </div>
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">等待测试开始...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}